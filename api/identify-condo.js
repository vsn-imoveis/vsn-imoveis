export default async function handler(req,res){
  try{
    if(req.method!=='POST') return res.status(405).json({error:'Método não permitido'});
    const {address,number,cep,city,state}=req.body||{};
    if(!address||!number) return res.status(400).json({error:'Informe endereço e número.'});

    const apiKey=process.env.OPENAI_API_KEY;
    if(!apiKey) return res.status(500).json({
      error:'OPENAI_API_KEY não configurada na Vercel.',
      debug:{request:{address,number,cep,city,state}}
    });

    const cepClean=String(cep||'').replace(/\D/g,'');
    const exactAddress=[address,number,city,state].filter(Boolean).join(', ');
    const searchInstruction=[
      'Identifique com precisão o condomínio localizado neste endereço.',
      `Endereço: ${address}, ${number}`,
      `CEP: ${cepClean||'não informado'}`,
      `Cidade: ${city||'não informada'}`,
      `Estado: ${state||'não informado'}`,
      '',
      'Use busca na web. Priorize fontes imobiliárias e documentos públicos que mostrem explicitamente o endereço e o número.',
      'Não invente o nome. Se houver nomes variantes, informe o nome principal e as variantes.',
      'Retorne SOMENTE JSON válido neste formato:',
      '{',
      '  "condominium_name": "nome principal ou vazio",',
      '  "name_variants": ["variantes"],',
      '  "confidence": "alta|media|baixa",',
      '  "evidence": "explicação curta baseada nas fontes",',
      '  "sources": [{"title":"...","url":"...","evidence":"..."}]',
      '}'
    ].join('\n');

    const r=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':'Bearer '+apiKey
      },
      body:JSON.stringify({
        model:'gpt-5.6-luna',
        tools:[{type:'web_search_preview'}],
        input:searchInstruction,
        max_output_tokens:1800
      })
    });

    const raw=await r.text();
    let data;
    try{data=JSON.parse(raw)}catch(_){
      return res.status(502).json({
        error:'A OpenAI retornou uma resposta não-JSON.',
        debug:{request:{address,number,cep,city,state},http_status:r.status,raw:raw.slice(0,4000)}
      });
    }

    if(!r.ok){
      return res.status(502).json({
        error:data?.error?.message||'Falha na OpenAI.',
        debug:{
          request:{address,number,cep,city,state},
          openai_status:r.status,
          openai_error:data?.error||data
        }
      });
    }

    const outputText=String(data.output_text||'').trim();
    let result;
    try{result=JSON.parse(outputText)}catch(_){
      const m=outputText.match(/\{[\s\S]*\}/);
      if(m){try{result=JSON.parse(m[0])}catch(__){}}
    }
    if(!result||typeof result!=='object'){
      result={
        condominium_name:'',
        name_variants:[],
        confidence:'baixa',
        evidence:'A busca foi executada, mas a resposta não veio no formato esperado.',
        sources:[]
      };
    }

    const searchCalls=[];
    const walk=v=>{
      if(!v||typeof v!=='object')return;
      if(v.type==='web_search_call')searchCalls.push({
        id:v.id||null,
        status:v.status||null,
        action:v.action||null
      });
      if(Array.isArray(v))v.forEach(walk);
      else Object.values(v).forEach(walk);
    };
    walk(data.output);

    const annotations=[];
    const walkAnn=v=>{
      if(!v||typeof v!=='object')return;
      if(Array.isArray(v))return v.forEach(walkAnn);
      if(v.type==='url_citation')annotations.push({
        title:v.title||null,
        url:v.url||null,
        start_index:v.start_index,
        end_index:v.end_index
      });
      Object.values(v).forEach(walkAnn);
    };
    walkAnn(data.output);

    return res.status(200).json({
      condominium_name:String(result.condominium_name||'').trim(),
      name_variants:Array.isArray(result.name_variants)?result.name_variants:[],
      confidence:String(result.confidence||'baixa'),
      evidence:String(result.evidence||''),
      sources:Array.isArray(result.sources)?result.sources:[],
      debug:{
        request:{
          address,number,cep:cepClean,city,state,
          exact_address:exactAddress
        },
        openai:{
          model:'gpt-5.6-luna',
          response_id:data.id||null,
          search_calls:searchCalls,
          url_citations:annotations
        },
        returned_text:outputText
      }
    });
  }catch(e){
    return res.status(500).json({
      error:'Erro interno da API.',
      details:String(e?.message||e),
      debug:{stage:'identify-condo'}
    });
  }
}