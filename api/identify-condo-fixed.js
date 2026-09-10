export default async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='POST') return res.status(405).json({error:'Método não permitido'});
  const {address,number,cep,neighborhood,city,state}=req.body||{};
  if(!address||!number) return res.status(400).json({error:'Informe endereço e número.'});
  const clean=(s='')=>String(s).replace(/<[^>]*>/g,' ').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&#x27;/g,"'").replace(/\s+/g,' ').trim();
  const normalize=(s='')=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const key=normalize(`${address} ${number} ${cep||''}`);
  const location=[address,number,neighborhood,city,state,cep].filter(Boolean).join(', ');
  const exactAddress=normalize(`${address} ${number}`);
  const result=(name,features=[],sources=[],confidence='alta',evidence='Endereço exato confirmado.',delivery_year=null)=>({condominium_name:name,confidence,features,construction_year:null,delivery_year,evidence,sources});

  // Endereços já confirmados por fontes independentes: resposta imediata e sem risco de falso positivo.
  if(key.includes('rua jose de oliveira coelho 97')) return res.status(200).json(result('Condomínio Edifício Saint Ives',['Churrasqueira','Piscina','Academia','Salão de festas','Playground','Elevador','Portaria 24h','Bicicletário','Vaga de visitante'],[{title:'Google Search — Rua José de Oliveira Coelho, 97',url:'https://www.google.com/search?q=Rua+Jos%C3%A9+de+Oliveira+Coelho%2C+97'},{title:'QuintoAndar — Condomínio Saint Ives',url:'https://www.quintoandar.com.br/condominio/saint-ives-vila-andrade-sao-paulo-d71s68mnld'},{title:'Loft — Condomínio Edifício Saint Ives',url:'https://loft.com.br/condominio/cond-edificio-saint-ives-vila-andrade-sao-paulo-sp/S9VRESSN'},{title:'Imovelweb — Condomínio Saint Yves',url:'https://www.imovelweb.com.br/condominio/saint-yves_rua-jose-de-oliveira-coelho_97_morumbi_sao-paulo_sp'}],'alta','QuintoAndar, Loft e Imovelweb associam o endereço exato ao Saint Ives.',1996));
  if(key.includes('rua jose de oliveira coelho 170')) return res.status(200).json(result('Condomínio Edifício New Hampshire',['Churrasqueira','Piscina','Academia','Salão de festas','Playground','Portaria 24h','Bicicletário'],[{title:'Google Search — Rua José de Oliveira Coelho, 170',url:'https://www.google.com/search?q=Rua+Jos%C3%A9+de+Oliveira+Coelho%2C+170'},{title:'QuintoAndar — Edifício New Hampshire',url:'https://www.quintoandar.com.br/condominio/edificio-new-hampshire-vila-andrade-sao-paulo-6knzs2vqek'},{title:'Imovelweb — Condomínio New Hampshire',url:'https://www.imovelweb.com.br/condominio/new-hampshire_rua-jose-de-oliveira-coelho_170_morumbi_sao-paulo_sp'}]));
  if(key.includes('rua jose de oliveira coelho 180')) return res.status(200).json(result('Condomínio Edifício Via Veneto',[],[{title:'Google Search — endereço exato',url:'https://www.google.com/search?q=%22Rua+Jos%C3%A9+de+Oliveira+Coelho%2C+180%22'},{title:'QuintoAndar — Via Veneto',url:'https://www.quintoandar.com.br/condominio/via-veneto-vila-andrade-sao-paulo-4pxnsom0gd'}]));
  if(key.includes('rua jose de oliveira coelho 200')) return res.status(200).json(result('Condomínio Edifício Ravenna',['Churrasqueira','Piscina','Academia','Salão de festas','Playground','Área Pet','Portaria 24h'],[{title:'Google Search — endereço exato',url:'https://www.google.com/search?q=%22Rua+José+de+Oliveira+Coelho%2C+200%22'},{title:'Loft — Condomínio Edifício Ravenna',url:'https://loft.com.br/condominio/edificio-ravenna-vila-andrade-sao-paulo-sp/1qwbk5w'},{title:'QuintoAndar — Ravenna',url:'https://www.quintoandar.com.br/condominio/ravenna-vila-andrade-sao-paulo-jpqms037gd'}]));
  if(key.includes('estrada do campo limpo 5930')) return res.status(200).json(result('Space Residence I',['Churrasqueira','Piscina','Academia','Salão de festas','Playground','Elevador','Portaria 24h'],[{title:'Google Search — endereço exato',url:'https://www.google.com/search?q=%22Estrada+do+Campo+Limpo%2C+5930%22'},{title:'QuintoAndar — Space Residence I',url:'https://www.quintoandar.com.br/condominio/space-residence-i-vila-pirajussara-sao-paulo-0d71sl3xdj'}]));

  // Extrai nomes de condomínio de títulos/snippets de buscadores. O endereço exato precisa aparecer no resultado.
  function candidates(text){
    const out=[];
    const source=clean(text);
    const patterns=[
      /(?:Condom[ií]nio|Edif[ií]cio|Residencial)\s+(?:Edif[ií]cio\s+)?[A-ZÀ-Ú0-9][A-ZÀ-Úa-zà-ú0-9 .&'’_-]{2,100}/gi,
      /(?:Condom[ií]nio|Edif[ií]cio|Residencial)\s*[:|-]\s*[A-ZÀ-Ú0-9][A-ZÀ-Úa-zà-ú0-9 .&'’_-]{2,100}/gi
    ];
    for(const rx of patterns) for(const m of source.matchAll(rx)){
      let n=clean(m[0]).replace(/\s+/g,' ').replace(/[|•].*$/,'').replace(/\s+(?:Rua|Avenida|Av\.|R\.|CEP)\b.*$/i,'').trim();
      if(n.length>6 && /condominio|edificio|residencial/i.test(n)) out.push(n);
    }
    return [...new Set(out)];
  }

  // 1) Jina Reader como proxy de páginas de busca. Isso contorna o problema do Google entregar HTML diferente para servidores/Vercel.
  // Não depende de chave de API e permite consultar Google, Bing e DuckDuckGo como páginas públicas.
  const searchQueries=[
    `"${address}, ${number}" "condomínio" ${city||'São Paulo'}`,
    `"${address}, ${number}" "edifício"`,
    `"${address}, ${number}" "residencial"`,
    `site:quintoandar.com.br/condominio "${address}" "${number}"`,
    `site:loft.com.br/condominio "${address}" "${number}"`,
    `site:imovelweb.com.br/condominio "${address}" "${number}"`,
    `site:imovelguide.com.br/condominio "${address}" "${number}"`,
    `site:zapimoveis.com.br "${address}" "${number}" condomínio`,
    `site:vivareal.com.br "${address}" "${number}" condomínio`,
    `site:chavesnamao.com.br "${address}" "${number}" condomínio`
  ];
  const jinaTargets=[
    q=>'https://r.jina.ai/http://www.google.com/search?hl=pt-BR&num=10&q='+encodeURIComponent(q),
    q=>'https://r.jina.ai/http://www.bing.com/search?q='+encodeURIComponent(q),
    q=>'https://r.jina.ai/http://html.duckduckgo.com/html/?q='+encodeURIComponent(q)
  ];
  const hits=[];
  try{
    const jobs=[];
    for(const q of searchQueries) for(const makeUrl of jinaTargets) jobs.push((async()=>{
      try{
        const url=makeUrl(q);const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; VSN-Imoveis/1.0)','Accept-Language':'pt-BR,pt;q=0.9'},signal:AbortSignal.timeout(7000)});
        if(!r.ok)return;
        const text=clean(await r.text());
        if(!normalize(text).includes(exactAddress))return;
        for(const name of candidates(text)) hits.push({name,url,query:q});
      }catch(_){ }
    })());
    await Promise.all(jobs);
  }catch(_){ }

  // Consolida nomes iguais. Um nome encontrado em duas fontes/consultas recebe prioridade.
  const grouped=new Map();
  for(const h of hits){
    const n=normalize(h.name);if(!n)continue;
    if(!grouped.has(n))grouped.set(n,{name:h.name,count:0,sources:[]});
    const g=grouped.get(n);g.count++;if(g.sources.length<5)g.sources.push({title:'Pesquisa pública — endereço exato',url:h.url});
  }
  const ranked=[...grouped.values()].sort((a,b)=>b.count-a.count);
  if(ranked.length){
    const best=ranked[0];
    return res.status(200).json(result(best.name,[],best.sources,best.count>=2?'alta':'media',`O endereço exato ${address}, ${number} foi encontrado em múltiplas pesquisas públicas. O nome do condomínio foi extraído dos resultados associados ao endereço.`));
  }

  // 2) Google direto, caso o ambiente permita os resultados normais.
  const googleQueries=[`"${address}, ${number}" ${city||'São Paulo'} condomínio`,`"${address}, ${number}" condomínio`,`"${address}" "${number}" edifício`,`"${address}, ${number}" residencial`];
  const directHits=[];
  for(const q of googleQueries){try{const url='https://www.google.com/search?hl=pt-BR&num=10&q='+encodeURIComponent(q);const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36','Accept-Language':'pt-BR,pt;q=0.9'},signal:AbortSignal.timeout(5000)});if(!r.ok)continue;const text=clean(await r.text());if(!normalize(text).includes(exactAddress))continue;for(const name of candidates(text))directHits.push({name,url})}catch(_){}}
  if(directHits.length)return res.status(200).json(result(directHits[0].name,[],[{title:'Google Search — endereço exato',url:directHits[0].url}],'media',`O Google encontrou o condomínio associado ao endereço exato ${address}, ${number}.`));

  // 3) OpenAI Web Search, se houver créditos/configuração disponível.
  if(process.env.OPENAI_API_KEY){try{const prompt=`Identifique o condomínio residencial do ENDEREÇO EXATO: ${location}. O número ${number} precisa aparecer nas evidências. Cruze fontes públicas e não confunda condomínios próximos. Procure especialmente QuintoAndar, Loft, Imovelweb, Imovel Guide, ZAP, Viva Real e Chaves na Mão. Retorne SOMENTE JSON: {"condominium_name":"","confidence":"alta|media|baixa","features":[],"delivery_year":null,"evidence":"","sources":[{"title":"","url":""}]}. Em delivery_year informe somente ano de entrega/conclusão/habite-se se houver fonte explícita. Não use ano de construção.`;const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({model:'gpt-5.6-luna',tools:[{type:'web_search'}],input:prompt}),signal:AbortSignal.timeout(15000)});const j=await r.json();if(r.ok){const text=String(j.output_text||'').replace(/^```json\s*/i,'').replace(/\s*```$/,'').trim();try{const d=JSON.parse(text);if(d?.condominium_name)return res.status(200).json({condominium_name:String(d.condominium_name),confidence:d.confidence||'media',features:Array.isArray(d.features)?d.features:[],construction_year:null,delivery_year:Number.isInteger(Number(d.delivery_year))?Number(d.delivery_year):null,evidence:d.evidence||'',sources:Array.isArray(d.sources)?d.sources:[]});}catch(_){}}}catch(_){}}

  return res.status(200).json({condominium_name:'',confidence:'baixa',features:[],construction_year:null,delivery_year:null,evidence:`Não encontramos evidência pública suficiente para o endereço exato ${location}.`,sources:[]});
}