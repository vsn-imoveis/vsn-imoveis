export default async function handler(req,res){
  try{
    if(req.method!=='POST') return res.status(405).json({error:'Método não permitido'});

    const {address,number,cep,city,state}=req.body||{};
    if(!address||!number) return res.status(400).json({error:'Informe endereço e número.'});

    const exactAddress=[address,number,city,state].filter(Boolean).join(', ');
    const cepClean=String(cep||'').replace(/\D/g,'');

    // Pesquisa externa, sem OpenAI e sem lista fixa de condomínios.
    // Google Custom Search JSON API: configurar GOOGLE_API_KEY e GOOGLE_CX na Vercel.
    const apiKey=process.env.GOOGLE_API_KEY;
    const cx=process.env.GOOGLE_CX;
    if(!apiKey||!cx){
      return res.status(500).json({
        error:'Pesquisa na internet não configurada. Configure GOOGLE_API_KEY e GOOGLE_CX na Vercel.',
        debug:{request:{address,number,cep:cepClean,city,state,exact_address:exactAddress}}
      });
    }

    const queries=[
      `"${address}" "${number}" "${cepClean}" condomínio`,
      `"${address}" "${number}" "${city}" condomínio`,
      `"${address}" "${number}" QuintoAndar OR Loft OR VivaReal OR ZAP OR Imovelweb`
    ];

    const results=[];
    for(const q of queries){
      const url='https://www.googleapis.com/customsearch/v1?'+new URLSearchParams({
        key:apiKey,
        cx,
        q,
        num:'10',
        hl:'pt-BR',
        gl:'br'
      }).toString();

      const rr=await fetch(url,{headers:{'Accept':'application/json'}});
      const raw=await rr.text();
      let data;
      try{data=JSON.parse(raw)}catch(_){
        return res.status(502).json({error:'O serviço de pesquisa retornou uma resposta inválida.',debug:{query:q,http_status:rr.status,raw:raw.slice(0,2000)}});
      }
      if(!rr.ok){
        return res.status(502).json({
          error:data?.error?.message||'Falha no serviço de pesquisa.',
          debug:{query:q,http_status:rr.status,provider_error:data?.error||data}
        });
      }

      for(const item of (data.items||[])){
        results.push({
          query:q,
          title:item.title||'',
          url:item.link||'',
          snippet:item.snippet||''
        });
      }
    }

    const addressTokens=exactAddress.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .split(/[^a-z0-9]+/).filter(x=>x.length>2);

    const scored=results.map(r=>{
      const text=(r.title+' '+r.snippet+' '+r.url).toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      let score=0;
      for(const token of addressTokens) if(text.includes(token)) score+=1;
      if(cepClean&&text.includes(cepClean)) score+=8;
      if(text.includes(String(number).toLowerCase())) score+=5;
      if(/condominio|residencial|edificio|edifício|residence|park|parque/.test(text)) score+=3;
      if(/quintoandar|loft|vivareal|zapimoveis|imovelweb|123i|attria/.test(text)) score+=2;
      return {...r,score};
    }).sort((a,b)=>b.score-a.score);

    const unique=[];
    const seen=new Set();
    for(const item of scored){
      if(!item.url||seen.has(item.url)) continue;
      seen.add(item.url);
      unique.push(item);
    }

    // Extração conservadora: só identifica quando o nome aparece claramente
    // associado ao endereço nos resultados. Sem cadastro prévio de condomínios.
    const positive=unique.filter(x=>{
      const t=(x.title+' '+x.snippet).toLowerCase();
      const hasAddress=(t.includes(String(number).toLowerCase())||t.includes(cepClean));
      const hasCondo=/condominio|condomínio|residencial|residence|edificio|edifício/.test(t);
      return hasAddress&&hasCondo;
    });

    let condominium_name='';
    let confidence='baixa';

    if(positive.length){
      const candidates=new Map();
      for(const item of positive){
        const text=item.title+' '+item.snippet;
        const patterns=[
          /condom[ií]nio\s+([^|•,\-–]+?)(?=\s+(?:na|no|em|,)?\s*(?:rua|avenida|av\.?|estrada|r\.?|endereço|cep)\b|$)/i,
          /(?:residencial|residence|edif[ií]cio)\s+([^|•,\-–]+?)(?=\s+(?:na|no|em|,)?\s*(?:rua|avenida|av\.?|estrada|r\.?|endereço|cep)\b|$)/i
        ];
        let name='';
        for(const p of patterns){
          const m=text.match(p);
          if(m){name=m[1].trim();break;}
        }
        if(name){
          name=name.replace(/\s+/g,' ').replace(/[.,;:]+$/,'').trim();
          if(name.length>2&&name.length<120) candidates.set(name,(candidates.get(name)||0)+1);
        }
      }
      if(candidates.size){
        const sorted=[...candidates.entries()].sort((a,b)=>b[1]-a[1]);
        condominium_name=sorted[0][0];
        confidence=sorted[0][1]>=2?'alta':'media';
      }
    }

    return res.status(200).json({
      condominium_name,
      name_variants:[],
      confidence,
      evidence:condominium_name
        ? 'Identificação obtida por pesquisa externa na internet, sem lista fixa.'
        : 'A pesquisa encontrou resultados, mas não houve evidência textual suficiente para identificar o condomínio com segurança.',
      sources:unique.slice(0,20).map(x=>({title:x.title,url:x.url,snippet:x.snippet})),
      debug:{
        request:{address,number,cep:cepClean,city,state,exact_address:exactAddress},
        provider:'Google Custom Search JSON API',
        queries,
        result_count:unique.length,
        top_results:unique.slice(0,20)
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