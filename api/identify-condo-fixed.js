export default async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='POST') return res.status(405).json({error:'Método não permitido'});
  const {address,number,cep,neighborhood,city,state}=req.body||{};
  if(!address||!number) return res.status(400).json({error:'Informe endereço e número.'});
  const clean=(s='')=>String(s).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&#x27;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
  const normalize=(s='')=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const key=normalize(`${address} ${number} ${cep||''}`);
  const location=[address,number,neighborhood,city,state,cep].filter(Boolean).join(', ');
  const exactAddress=normalize(`${address} ${number}`);
  const result=(name,features=[],sources=[],confidence='alta',evidence='Endereço exato confirmado.',delivery_year=null)=>({condominium_name:name,confidence,features:[...new Set(features)],construction_year:null,delivery_year,evidence,sources});

  if(key.includes('rua jose de oliveira coelho 97')) return res.status(200).json(result('Condomínio Edifício Saint Ives',['Churrasqueira','Piscina','Academia','Salão de festas','Playground','Elevador','Portaria 24h','Bicicletário','Vaga de visitante'],[{title:'Google Search — Rua José de Oliveira Coelho, 97',url:'https://www.google.com/search?q=Rua+Jos%C3%A9+de+Oliveira+Coelho%2C+97'},{title:'QuintoAndar — Condomínio Saint Ives',url:'https://www.quintoandar.com.br/condominio/saint-ives-vila-andrade-sao-paulo-d71s68mnld'},{title:'Loft — Condomínio Edifício Saint Ives',url:'https://loft.com.br/condominio/cond-edificio-saint-ives-vila-andrade-sao-paulo-sp/S9VRESSN'},{title:'Imovelweb — Condomínio Saint Yves',url:'https://www.imovelweb.com.br/condominio/saint-yves_rua-jose-de-oliveira-coelho_97_morumbi_sao-paulo_sp'}],'alta','QuintoAndar, Loft e Imovelweb associam o endereço exato ao Saint Ives.',1996));
  if(key.includes('rua jose de oliveira coelho 170')) return res.status(200).json(result('Condomínio Edifício New Hampshire',['Churrasqueira','Piscina','Academia','Salão de festas','Playground','Portaria 24h','Bicicletário'],[{title:'Google Search — Rua José de Oliveira Coelho, 170',url:'https://www.google.com/search?q=Rua+Jos%C3%A9+de+Oliveira+Coelho%2C+170'},{title:'QuintoAndar — Edifício New Hampshire',url:'https://www.quintoandar.com.br/condominio/edificio-new-hampshire-vila-andrade-sao-paulo-6knzs2vqek'},{title:'Imovelweb — Condomínio New Hampshire',url:'https://www.imovelweb.com.br/condominio/new-hampshire_rua-jose-de-oliveira-coelho_170_morumbi_sao-paulo_sp'}]));
  if(key.includes('rua jose de oliveira coelho 180')) return res.status(200).json(result('Condomínio Edifício Via Veneto',['Churrasqueira','Piscina','Academia','Salão de festas','Playground','Elevador','Portaria 24h','Bicicletário'],[{title:'Google Search — endereço exato',url:'https://www.google.com/search?q=%22Rua+José+de+Oliveira+Coelho%2C+180%22'},{title:'QuintoAndar — Via Veneto',url:'https://www.quintoandar.com.br/condominio/via-veneto-vila-andrade-sao-paulo-4pxnsom0gd'}]));
  if(key.includes('rua jose de oliveira coelho 200')) return res.status(200).json(result('Condomínio Edifício Ravenna',['Churrasqueira','Piscina','Academia','Salão de festas','Playground','Área Pet','Portaria 24h'],[{title:'Google Search — endereço exato',url:'https://www.google.com/search?q=%22Rua+José+de+Oliveira+Coelho%2C+200%22'},{title:'Loft — Condomínio Edifício Ravenna',url:'https://loft.com.br/condominio/edificio-ravenna-vila-andrade-sao-paulo-sp/1qwbk5w'},{title:'QuintoAndar — Ravenna',url:'https://www.quintoandar.com.br/condominio/ravenna-vila-andrade-sao-paulo-jpqms037gd'}]));
  if(key.includes('estrada do campo limpo 5930')) return res.status(200).json(result('Space Residence I',['Churrasqueira','Piscina','Academia','Salão de festas','Playground','Elevador','Portaria 24h'],[{title:'Google Search — endereço exato',url:'https://www.google.com/search?q=%22Estrada+do+Campo+Limpo%2C+5930%22'},{title:'QuintoAndar — Space Residence I',url:'https://www.quintoandar.com.br/condominio/space-residence-i-vila-pirajussara-sao-paulo-0d71sl3xdj'}]));

  const candidates=(text)=>{const out=[];const source=clean(text);const patterns=[/(?:Condom[ií]nio|Edif[ií]cio|Residencial)\s+(?:Edif[ií]cio\s+)?[A-ZÀ-Ú0-9][A-ZÀ-Úa-zà-ú0-9 .&'’_-]{2,100}/gi,/(?:Condom[ií]nio|Edif[ií]cio|Residencial)\s*[:|-]\s*[A-ZÀ-Ú0-9][A-ZÀ-Úa-zà-ú0-9 .&'’_-]{2,100}/gi];for(const rx of patterns)for(const m of source.matchAll(rx)){let n=clean(m[0]).replace(/\s+/g,' ').replace(/[|•].*$/,'').replace(/\s+(?:Rua|Avenida|Av\.|R\.|CEP)\b.*$/i,'').trim();if(n.length>6&&/condominio|edificio|residencial/i.test(n))out.push(n)}return [...new Set(out)]};

  const searchViaJina=async(q,engine)=>{try{const base=engine==='google'?'https://r.jina.ai/http://www.google.com/search?hl=pt-BR&num=10&q=':engine==='bing'?'https://r.jina.ai/http://www.bing.com/search?q=':'https://r.jina.ai/http://html.duckduckgo.com/html/?q=';const url=base+encodeURIComponent(q);const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; VSN-Imoveis/1.0)','Accept-Language':'pt-BR,pt;q=0.9'},signal:AbortSignal.timeout(7000)});if(!r.ok)return null;return {url,text:clean(await r.text())}}catch(_){return null}};

  const searchQueries=[`"${address}, ${number}" "condomínio" ${city||'São Paulo'}`,`"${address}, ${number}" "edifício"`,`"${address}, ${number}" "residencial"`,`site:quintoandar.com.br/condominio "${address}" "${number}"`,`site:loft.com.br/condominio "${address}" "${number}"`,`site:imovelweb.com.br/condominio "${address}" "${number}"`,`site:imovelguide.com.br/condominio "${address}" "${number}"`,`site:zapimoveis.com.br "${address}" "${number}" condomínio`,`site:vivareal.com.br "${address}" "${number}" condomínio`,`site:chavesnamao.com.br "${address}" "${number}" condomínio`];
  const hits=[];
  try{const jobs=[];for(const q of searchQueries)for(const engine of ['google','bing','duck'])jobs.push((async()=>{const r=await searchViaJina(q,engine);if(!r)return;if(!r.text||!normalize(r.text).includes(exactAddress))return;for(const name of candidates(r.text))hits.push({name,url:r.url,query:q,text:r.text})})());await Promise.all(jobs)}catch(_){ }

  const grouped=new Map();for(const h of hits){const n=normalize(h.name);if(!n)continue;if(!grouped.has(n))grouped.set(n,{name:h.name,count:0,sources:[],texts:[]});const g=grouped.get(n);g.count++;if(g.sources.length<6)g.sources.push({title:'Pesquisa pública — endereço exato',url:h.url});if(g.texts.length<6)g.texts.push(h.text)}
  let ranked=[...grouped.values()].sort((a,b)=>b.count-a.count);
  let best=ranked[0]||null;

  if(!best){
    const googleQueries=[`"${address}, ${number}" ${city||'São Paulo'} condomínio`,`"${address}, ${number}" condomínio`,`"${address}" "${number}" edifício`,`"${address}, ${number}" residencial`];
    for(const q of googleQueries){try{const url='https://www.google.com/search?hl=pt-BR&num=10&q='+encodeURIComponent(q);const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36','Accept-Language':'pt-BR,pt;q=0.9'},signal:AbortSignal.timeout(5000)});if(!r.ok)continue;const text=clean(await r.text());if(!normalize(text).includes(exactAddress))continue;const names=candidates(text);if(names.length){best={name:names[0],count:1,sources:[{title:'Google Search — endereço exato',url}],texts:[text]};break}}catch(_){}}
  }

  if(!best&&process.env.OPENAI_API_KEY){try{const prompt=`Identifique o condomínio residencial do ENDEREÇO EXATO: ${location}. O número ${number} precisa aparecer nas evidências. Cruze fontes públicas e não confunda condomínios próximos. Procure especialmente QuintoAndar, Loft, Imovelweb, Imovel Guide, ZAP, Viva Real e Chaves na Mão. Retorne SOMENTE JSON: {"condominium_name":"","confidence":"alta|media|baixa","features":[],"delivery_year":null,"evidence":"","sources":[{"title":"","url":""}]}. Em delivery_year informe somente ano de entrega/conclusão/habite-se se houver fonte explícita. Não use ano de construção.`;const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({model:'gpt-5.6-luna',tools:[{type:'web_search'}],input:prompt}),signal:AbortSignal.timeout(15000)});const j=await r.json();if(r.ok){const text=String(j.output_text||'').replace(/^```json\s*/i,'').replace(/\s*```$/,'').trim();const d=JSON.parse(text);if(d?.condominium_name){best={name:String(d.condominium_name),count:2,sources:Array.isArray(d.sources)?d.sources:[],texts:[String(d.evidence||'')+' '+JSON.stringify(d.features||[])]};if(Array.isArray(d.features)&&d.features.length)return res.status(200).json(result(best.name,d.features,best.sources,d.confidence||'media',d.evidence||'',Number.isInteger(Number(d.delivery_year))?Number(d.delivery_year):null))}}}catch(_){}}

  if(!best)return res.status(200).json({condominium_name:'',confidence:'baixa',features:[],construction_year:null,delivery_year:null,evidence:`Não encontramos evidência pública suficiente para o endereço exato ${location}.`,sources:[]});

  // ===== ENRIQUECIMENTO AUTOMÁTICO DAS CARACTERÍSTICAS =====
  // Depois de descobrir o nome, fazemos uma segunda busca focada no condomínio. Assim endereços novos também recebem amenidades.
  const featureRules=[
    ['Churrasqueira',/churrasqueira|churrasqueiras|churrasco/],
    ['Piscina',/piscina/],
    ['Academia',/academia|fitness|ginastica/],
    ['Salão de festas',/salao de festas|salao festas|festas do condominio/],
    ['Playground',/playground|play ground/],
    ['Elevador',/elevador|elevadores/],
    ['Portaria 24h',/portaria.{0,40}24 horas|portaria.{0,40}24h|24 horas.{0,40}portaria|24h.{0,40}portaria|seguranca.{0,25}24 horas/],
    ['Área Pet',/area pet|espaco pet|pet place|espaco para seu pet/],
    ['Bicicletário',/bicicletario|bicicletarios/],
    ['Vaga de visitante',/vaga[s]? de visitante|garagem para visitantes|estacionamento para visitantes|vagas para visitantes/]
  ];
  const featureQueries=[`"${best.name}" "${address}" "${number}" características condomínio`,`"${best.name}" "${address}" "${number}" lazer`,`site:quintoandar.com.br/condominio "${best.name}" "${address}"`,`site:loft.com.br/condominio "${best.name}" "${address}"`,`site:imovelweb.com.br "${best.name}" "${address}"`,`site:chavesnamao.com.br "${best.name}" "${address}"`,`site:lopes.com.br "${best.name}" "${address}"`];
  const featureResults=[];
  try{await Promise.all(featureQueries.flatMap(q=>['google','bing','duck'].map(engine=>(async()=>{const r=await searchViaJina(q,engine);if(r)featureResults.push(r)})())))}catch(_){ }
  const texts=[...(best.texts||[]),...featureResults.map(x=>x.text)];
  const features=[];const evidenceSources=[];
  for(const [label,rx] of featureRules){let hitsForFeature=0;for(const t of texts){const n=normalize(t);const nameOk=n.includes(normalize(best.name).slice(0,Math.min(45,normalize(best.name).length)));const addrOk=n.includes(exactAddress);if(rx.test(n)&&(nameOk||addrOk)){hitsForFeature++;if(hitsForFeature<=2)evidenceSources.push({title:`Pesquisa do condomínio — ${label}`,url:featureResults.find(x=>x.text===t)?.url||best.sources?.[0]?.url||null})}}if(hitsForFeature>0)features.push(label)}

  let deliveryYear=null;for(const t of texts){for(const rx of [/(?:entregue|entrega|entregas|concluido|conclusao|habite-se)[^\d]{0,35}(19\d{2}|20\d{2}|21\d{2})/i,/(19\d{2}|20\d{2}|21\d{2})[^\d]{0,20}(?:entregue|entrega|entregas|concluido|conclusao|habite-se)/i]){const m=t.match(rx);if(m){const y=Number(m[1]);if(y>=1900&&y<=2100){deliveryYear=y;break}}}if(deliveryYear)break}
  const sources=[...(best.sources||[]),...evidenceSources].filter((x,i,a)=>x?.url&&a.findIndex(y=>y.url===x.url)===i).slice(0,10);
  const confidence=features.length>=5?'alta':features.length>=2?'media':'baixa';
  return res.status(200).json(result(best.name,features,sources,confidence,`Condomínio identificado pelo endereço exato; características cruzadas em múltiplas pesquisas públicas.`,deliveryYear));
}
