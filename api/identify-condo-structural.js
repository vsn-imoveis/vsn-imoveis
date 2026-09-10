export default async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='POST') return res.status(405).json({error:'Método não permitido'});
  const {address,number,neighborhood,city='São Paulo',state='SP',cep}=req.body||{};
  if(!address||!number) return res.status(400).json({error:'Informe endereço e número.'});
  const location=[address,number,neighborhood,city,state,cep].filter(Boolean).join(', ');
  const clean=s=>String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const search=async q=>{try{const u='https://r.jina.ai/http://www.google.com/search?hl=pt-BR&num=10&q='+encodeURIComponent(q);const r=await fetch(u,{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(8000)});if(!r.ok)return '';return clean(await r.text())}catch{return ''}};
  const queries=[
    `"${address}, ${number}" condomínio construtora`,
    `"${address}, ${number}" "construtora"`,
    `"${address}, ${number}" "unidades"`,
    `"${address}, ${number}" "terreno"`,
    `"${address}, ${number}" "ano de entrega"`,
    `"${address}, ${number}" "ano de construção"`,
    `"${address}, ${number}" "ficha técnica"`,
    `"${address}, ${number}" "torres"`,
    `"${address}, ${number}" "andares"`,
    `"${address}, ${number}" "pavimentos"`
  ];
  const texts=await Promise.all(queries.map(search));
  const combined=texts.filter(Boolean).join('\n');
  let data={condominium_builder:null,condominium_delivery_year:null,condominium_units:null,condominium_land_area:null,towers:null,floors:null,sources:[]};
  const sourceLines=[];
  const addSource=(q,i)=>{sourceLines.push({title:q,url:'https://www.google.com/search?q='+encodeURIComponent(q)});};
  const year=(combined.match(/(?:entrega|entregue|entregues|conclus[aã]o|conclu[ií]do|habite-se)[^\n.]{0,100}?(?:19|20)\d{2}/i)||[])[0];
  if(year){const m=year.match(/(?:19|20)\d{2}/);if(m)data.condominium_delivery_year=Number(m[0]);}
  const units=(combined.match(/(?:total de|possui|com|de)\s*(\d{1,4})\s*(?:unidades|apartamentos|unidades aut[oô]nomas)/i)||[])[1];
  if(units)data.condominium_units=Number(units);
  const land=(combined.match(/(?:terreno|[aá]rea do terreno|[aá]rea total do terreno)[^\n.]{0,50}?(\d{1,3}(?:\.\d{3})*(?:,\d+)?)\s*m[²2]/i)||[])[1];
  if(land)data.condominium_land_area=Number(land.replace(/\./g,'').replace(',','.'));
  const floors=(combined.match(/(?:\b|[^0-9])([6-9]|[1-3]\d|40)\s*(?:andares|pavimentos)/i)||[])[1];
  if(floors)data.floors=Number(floors);
  const towers=(combined.match(/(?:\b|[^0-9])([1-9]|[1-2]\d)\s*torres?/i)||[])[1];
  if(towers)data.towers=Number(towers);

  // A busca estruturada via modelo é usada para cruzar fontes públicas, sem inventar dados.
  if(process.env.OPENAI_API_KEY){
    try{
      const prompt=`Pesquise fontes públicas para o condomínio do endereço EXATO ${location}. Identifique: nome do condomínio, construtora/incorporadora, ano de ENTREGA (não simplesmente construção), quantidade de unidades, área do terreno em m², quantidade de torres e andares/pavimentos. Priorize site oficial da construtora/incorporadora e depois fontes imobiliárias confiáveis. Não invente. Se um campo não tiver confirmação, retorne null. Para cada campo, informe uma fonte URL. Retorne SOMENTE JSON: {"condominium_builder":null,"condominium_delivery_year":null,"condominium_units":null,"condominium_land_area":null,"towers":null,"floors":null,"sources":[]}. O endereço e número precisam corresponder ao empreendimento exato.`;
      const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({model:'gpt-5.6-luna',tools:[{type:'web_search'}],input:prompt}),signal:AbortSignal.timeout(20000)});
      const j=await r.json();
      if(r.ok){const raw=String(j.output_text||'').replace(/^```json\s*/i,'').replace(/\s*```$/,'').trim();const d=JSON.parse(raw);for(const k of ['condominium_builder','condominium_delivery_year','condominium_units','condominium_land_area','towers','floors'])if(d[k]!==null&&d[k]!==undefined)data[k]=d[k];if(Array.isArray(d.sources))data.sources=d.sources;}
    }catch(e){console.warn('Structural search failed',e?.message||e)}
  }
  if(!data.condominium_builder&&!data.condominium_delivery_year&&!data.condominium_units&&!data.condominium_land_area&&!data.towers&&!data.floors){
    return res.status(200).json({...data,evidence:'Não foi encontrada confirmação suficiente para os dados estruturais.'});
  }
  return res.status(200).json({...data,sources:data.sources.length?data.sources:sourceLines.slice(0,5),evidence:'Dados estruturais obtidos por cruzamento de fontes públicas.'});
}
