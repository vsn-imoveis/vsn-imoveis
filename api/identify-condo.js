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
      'IDENTIFIQUE O CONDOMÍNIO EXATO DESTE ENDEREÇO USANDO PESQUISA REAL NA INTERNET.',
      'Não use lista fixa, memória, banco interno ou nomes previamente conhecidos.',
      'Pesquise o endereço completo e compare os resultados encontrados em múltiplas fontes.',
      'Priorize páginas que associem explicitamente o número do imóvel ao nome do condomínio, como QuintoAndar, Loft, ZAP, VivaReal, Imovelweb, 123i, Attria e documentos públicos.',
      'Não confunda o nome de um empreendimento próximo com o condomínio do endereço informado.',
      'Se houver variações de nome para o mesmo condomínio, informe a variação mais usada e coloque as demais em name_variants.',
      'Se não houver evidência suficiente, não invente um nome.',
      '',
      'ENDEREÇO:',
      exactAddress,
      'CEP: '+(cepClean||'não informado'),
      '',
      'Responda em JSON puro, sem markdown:',
      '{"condominium_name":"","name_variants":[],"confidence":"alta|media|baixa","evidence":""}',
      'condominium_name deve ficar vazio se não houver evidência suficiente.'
    ].join('\n');

    const r=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':'Bearer '+apiKey
      },
      body:JSON.stringify({
        model:'gpt-5.5',
        tools:[{
          type:'web_search',
          external_web_access:true,
          search_context_size:'low'
        }],
        tool_choice:'required',
        include:['web_search_call.action.sources'],
        input:searchInstruction,
        max_output_tokens:500
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

    let result={condominium_name:'',name_variants:[],confidence:'baixa',evidence:''};
    try{
      const cleaned=outputText
        .replace(/^\`\`\`json\s*/i,'')
        .replace(/^\`\`\`\s*/,'')
        .replace(/\s*\`\`\`$/,'')
        .trim();
      const parsed=JSON.parse(cleaned);
      result={
        condominium_name:String(parsed?.condominium_name||'').trim(),
        name_variants:Array.isArray(parsed?.name_variants)?parsed.name_variants.map(String):[],
        confidence:['alta','media','baixa'].includes(String(parsed?.confidence||'').toLowerCase())?String(parsed.confidence).toLowerCase():'baixa',
        evidence:String(parsed?.evidence||'').trim()
      };
    }catch(_){
      const fallback=outputText
        .split(/\n|\r/)
        .map(s=>s.trim())
        .find(s=>s && !/^NOT_FOUND$/i.test(s) && !/^\{/.test(s));
      if(fallback) result.condominium_name=fallback.replace(/^[-*•]\s*/,'').trim();
      result.evidence=result.condominium_name?'Nome extraído da resposta da pesquisa web.':'A resposta da pesquisa não pôde ser interpretada como identificação válida.';
      result.confidence=result.condominium_name?'media':'baixa';
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
      if(v.type==='url_citation'){
        annotations.push({
          title:v.title||null,
          url:v.url||null,
          start_index:v.start_index,
          end_index:v.end_index
        });
      }
      Object.values(v).forEach(walkAnn);
    };
    walkAnn(data.output);

    const sources=[];
    const walkSources=v=>{
      if(!v||typeof v!=='object')return;
      if(Array.isArray(v))return v.forEach(walkSources);
      if(v.url && typeof v.url==='string' && (v.title||v.url)){
        sources.push({title:v.title||null,url:v.url});
      }
      Object.values(v).forEach(walkSources);
    };
    walkSources(data.output);

    const uniqueSources=[];
    const seen=new Set();
    for(const s of sources){
      if(!seen.has(s.url)){
        seen.add(s.url);
        uniqueSources.push(s);
      }
    }

    return res.status(200).json({
      condominium_name:result.condominium_name,
      name_variants:result.name_variants,
      confidence:result.confidence,
      evidence:result.evidence,
      sources:uniqueSources.slice(0,20),
      debug:{
        request:{
          address,number,cep:cepClean,city,state,
          exact_address:exactAddress
        },
        openai:{
          model:'gpt-5.5',
          response_id:data.id||null,
          search_calls:searchCalls,
          url_citations:annotations,
          sources:uniqueSources.slice(0,20)
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