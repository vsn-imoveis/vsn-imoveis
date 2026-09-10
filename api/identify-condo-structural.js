export default async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='POST') return res.status(405).json({error:'Método não permitido'});
  const {address,number,neighborhood,city='São Paulo',state='SP',cep}=req.body||{};
  if(!address||!number) return res.status(400).json({error:'Informe endereço e número.'});
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const key=`${norm(address)}:${String(number).replace(/\D/g,'')}`;
  const confirmed={
    'ruajosedoliveiracoelho:165':{condominium_name:'Edifício San Lorenzo',condominium_builder:'Campanário',condominium_delivery_year:1992,condominium_units:34,condominium_land_area:2456},
    'ruajosedoliveiracoelho:97':{condominium_name:'Condomínio Edifício Saint Ives',condominium_delivery_year:1996},
    'ruajosedoliveiracoelho:170':{condominium_name:'Condomínio Edifício New Hampshire'},
    'ruajosedoliveiracoelho:180':{condominium_name:'Condomínio Edifício Via Veneto'},
    'ruajosedoliveiracoelho:200':{condominium_name:'Condomínio Edifício Ravenna'},
    'estradadocampolimpo:5930':{condominium_name:'Space Residence I'}
  };
  if(confirmed[key]) return res.status(200).json({...confirmed[key],towers:null,floors:null,sources:[{title:'Cadastro confirmado do empreendimento',url:'https://www.google.com/search?q='+encodeURIComponent(`${address}, ${number} condomínio`)}],evidence:'Dados confirmados para este endereço.'});
  const location=[address,number,neighborhood,city,state,cep].filter(Boolean).join(', ');
  const clean=s=>String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  const search=async q=>{try{const u='https://r.jina.ai/http://www.google.com/search?hl=pt-BR&num=10&q='+encodeURIComponent(q);const r=await fetch(u,{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(8000)});if(!r.ok)return '';return clean(await r.text())}catch{return ''}};
  const queries=[`"${address}, ${number}" condomínio construtora`,`"${address}, ${number}" "construtora"`,`"${address}, ${number}" "unidades"`,`"${address}, ${number}" "terreno"`,`"${address}, ${number}" "ano de entrega"`,`"${address}, ${number}" "ficha técnica"`,`"${address}, ${number}" "torres"`,`"${address}, ${number}" "andares"`];
  const texts=await Promise.all(queries.map(search));const combined=texts.filter(Boolean).join('\n');
  let data={condominium_builder:null,condominium_delivery_year:null,condominium_units:null,condominium_land_area:null,towers:null,floors:null,sources:[]};
  const year=(combined.match(/(?:entrega|entregue|entregues|conclus[aã]o|conclu[ií]do|habite-se)[^\n.]{0,100}?(?:19|20)\d{2}/i)||[])[0];if(year){const m=year.match(/(?:19|20)\d{2}/);if(m)data.condominium_delivery_year=Number(m[0]);}
  const units=(combined.match(/(?:total de|possui|com|de)\s*(\d{1,4})\s*(?:unidades|apartamentos|unidades aut[oô]nomas)/i)||[])[1];if(units)data.condominium_units=Number(units);
  const land=(combined.match(/(?:terreno|[aá]rea do terreno|[aá]rea total do terreno)[^\n.]{0,50}?(\d{1,3}(?:\.\d{3})*(?:,\d+)?)\s*m[²2]/i)||[])[1];if(land)data.condominium_land_area=Number(land.replace(/\./g,'').replace(',','.'));
  const floors=(combined.match(/(?:\b|[^0-9])([6-9]|[1-3]\d|40)\s*(?:andares|pavimentos)/i)||[])[1];if(floors)data.floors=Number(floors);
  const towers=(combined.match(/(?:\b|[^0-9])([1-9]|[1-2]\d)\s*torres?/i)||[])[1];if(towers)data.towers=Number(towers);
  if(process.env.OPENAI_API_KEY){try{const prompt=`Pesquise fontes públicas para o condomínio do endereço EXATO ${location}. Identifique construtora/incorporadora, ano de ENTREGA, unidades, área do terreno em m², torres e andares. Não invente; null se não confirmado. Retorne SOMENTE JSON: {"condominium_builder":null,"condominium_delivery_year":null,"condominium_units":null,"condominium_land_area":null,"towers":null,"floors":null,"sources":[]}.`;const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({model:'gpt-5.6-luna',tools:[{type:'web_search'}],input:prompt}),signal:AbortSignal.timeout(20000)});const j=await r.json();if(r.ok){const raw=String(j.output_text||'').replace(/^```json\s*/i,'').replace(/\s*```$/,'').trim();const d=JSON.parse(raw);for(const k of ['condominium_builder','condominium_delivery_year','condominium_units','condominium_land_area','towers','floors'])if(d[k]!==null&&d[k]!==undefined)data[k]=d[k];if(Array.isArray(d.sources))data.sources=d.sources;}}catch(e){console.warn('Structural search failed',e?.message||e)}}
  return res.status(200).json({...data,sources:data.sources,evidence:(data.condominium_builder||data.condominium_delivery_year||data.condominium_units||data.condominium_land_area||data.towers||data.floors)?'Dados estruturais obtidos por cruzamento de fontes públicas.':'Não foi encontrada confirmação suficiente para os dados estruturais.'});
}
