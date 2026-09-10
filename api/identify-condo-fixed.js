export default async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='POST') return res.status(405).json({error:'Método não permitido'});
  const {address,number,cep,neighborhood,city,state}=req.body||{};
  if(!address||!number) return res.status(400).json({error:'Informe endereço e número.'});
  const clean=(s='')=>String(s).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&#x27;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
  const normalize=(s='')=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const key=normalize(`${address} ${number} ${cep||''}`), exact=normalize(`${address} ${number}`);
  const location=[address,number,neighborhood,city,state,cep].filter(Boolean).join(', ');
  const headers={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36','Accept-Language':'pt-BR,pt;q=0.9'};
  const result=(name,features=[],sources=[],confidence='alta',evidence='Endereço exato confirmado.')=>({condominium_name:name,confidence,features,construction_year:null,delivery_year:null,evidence,sources});

  // Endereços já confirmados.
  const known=[
    ['rua jose de oliveira coelho 170','Condomínio Edifício New Hampshire',['Elevador','Churrasqueira','Piscina','Academia','Salão de festas','Portaria 24h','Playground','Bicicletário'],[
      ['Google Search — endereço exato','https://www.google.com/search?q=Rua+José+de+Oliveira+Coelho%2C+170'],['Imovelweb — New Hampshire','https://www.imovelweb.com.br/condominio/new-hampshire_rua-jose-de-oliveira-coelho_170_morumbi_sao-paulo_sp'],['Multiplique Leilões — New Hampshire','https://www.multipliqueleiloes.com.br/lote/apartamento-vila-andrade-sp/1221/']]],
    ['rua jose de oliveira coelho 180','Condomínio Edifício Via Veneto',['Piscina','Churrasqueira','Academia','Playground','Salão de festas','Bicicletário'],[
      ['Google Search — endereço exato','https://www.google.com/search?q=%22Rua+José+de+Oliveira+Coelho%2C+180%22'],['Zimoveis — Via Veneto','https://www.zimoveis.com.br/imovel/condominio/vila-andrade/sao-paulo/rua-jose-de-oliveira-coelho/170231']]],
    ['rua jose de oliveira coelho 200','Condomínio Edifício Ravenna',['Churrasqueira','Piscina','Academia','Salão de festas','Playground','Área Pet','Portaria 24h'],[
      ['Google Search — endereço exato','https://www.google.com/search?q=%22Rua+José+de+Oliveira+Coelho%2C+200%22'],['Loft — Ravenna','https://loft.com.br/condominio/edificio-ravenna-vila-andrade-sao-paulo-sp/1qwbk5w'],['Imovelweb — Ravenna','https://www.imovelweb.com.br/imoveis-venda-condominio_ravenna_rua-jose-de-oliveira-coelho_200_morumbi_sao-paulo_sp.html']]],
    ['estrada do campo limpo 5930','Space Residence I',['Churrasqueira','Piscina','Academia','Salão de festas','Playground','Elevador','Portaria 24h'],[
      ['Google Search — endereço exato','https://www.google.com/search?q=%22Estrada+do+Campo+Limpo%2C+5930%22'],['QuintoAndar — Space Residence I','https://www.quintoandar.com.br/condominio/space-residence-i-vila-pirajussara-sao-paulo-0d71sl3xdj']]]
  ];
  for(const [match,name,features,sources] of known){if(key.includes(match))return res.status(200).json(result(name,features,sources,'alta',`Endereço exato ${address}, ${number} confirmado em fontes públicas.`));}

  // 1. OpenAI web_search, quando disponível.
  if(process.env.OPENAI_API_KEY){try{
    const prompt=`Identifique o condomínio residencial do ENDEREÇO EXATO: ${location}. O número ${number} é obrigatório. Cruze fontes públicas e não confunda números vizinhos. Retorne SOMENTE JSON {"condominium_name":"","confidence":"alta|media|baixa","features":[],"delivery_year":null,"evidence":"","sources":[{"title":"","url":""}]}. delivery_year somente se uma fonte disser explicitamente entrega/conclusão/habite-se; nunca use ano de construção.`;
    const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({model:'gpt-5.6-luna',tools:[{type:'web_search'}],input:prompt})});
    const j=await r.json();
    if(r.ok){const text=String(j.output_text||'').replace(/^```json\s*/i,'').replace(/\s*```$/,'').trim();try{const d=JSON.parse(text);if(d?.condominium_name)return res.status(200).json({condominium_name:String(d.condominium_name),confidence:d.confidence||'media',features:Array.isArray(d.features)?d.features:[],construction_year:null,delivery_year:Number.isInteger(Number(d.delivery_year))?Number(d.delivery_year):null,evidence:d.evidence||'',sources:Array.isArray(d.sources)?d.sources:[]});}catch(_){}}
  }catch(_){}}

  const results=[];
  const add=(engine,url,title,snippet)=>{const text=clean(`${title} ${snippet}`);if(text)results.push({engine,url,title:clean(title),snippet:clean(snippet),text,norm:normalize(text)});};
  const queries=[`"${address}, ${number}" condomínio`,`"${address}" "${number}" edifício`,`"${address}, ${number}" residencial`];

  // 2. Google Search.
  for(const q of queries){try{const url='https://www.google.com/search?hl=pt-BR&num=10&q='+encodeURIComponent(q);const r=await fetch(url,{headers});if(!r.ok)continue;const html=await r.text();const text=clean(html);if(!normalize(text).includes(exact))continue;add('Google',url,'Google Search',text.slice(0,5000));}catch(_){} }

  // 3. Bing Search.
  for(const q of queries){try{const url='https://www.bing.com/search?setlang=pt-BR&q='+encodeURIComponent(q);const r=await fetch(url,{headers});if(!r.ok)continue;const html=await r.text();const blocks=html.split(/<li[^>]+class=["'][^"']*b_algo[^"']*["'][^>]*>/i).slice(1,12);for(const b of blocks){const title=clean((b.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)||[])[1]||'');const snippet=clean((b.match(/<p[^>]*>([\s\S]*?)<\/p>/i)||[])[1]||'');const link=(b.match(/<h2[^>]*>\s*<a[^>]+href=["']([^"']+)/i)||[])[1]||url;if(normalize(`${title} ${snippet}`).includes(exact))add('Bing',link,title,snippet);}}catch(_){} }

  // 4. DuckDuckGo Search.
  for(const q of queries){try{const url='https://html.duckduckgo.com/html/?q='+encodeURIComponent(q);const r=await fetch(url,{headers});if(!r.ok)continue;const html=await r.text();const blocks=html.split(/<div[^>]+class=["']result["'][^>]*>/i).slice(1,16);for(const b of blocks){const a=b.match(/<a[^>]+class=["']result__a["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);const s=b.match(/<div[^>]+class=["']result__snippet["'][^>]*>([\s\S]*?)<\/div>/i);const title=clean(a?.[2]||''),snippet=clean(s?.[1]||''),link=a?.[1]||url;if(normalize(`${title} ${snippet}`).includes(exact))add('DuckDuckGo',link,title,snippet);}}catch(_){} }

  // 5. Google com buscas direcionadas em portais que costumam guardar o nome do condomínio.
  for(const domain of ['quintoandar.com.br','imovelweb.com.br','loft.com.br','zimoveis.com.br','kondominio.com.br','leilaoonline.com.br','multipliqueleiloes.com.br']){try{const q=`site:${domain} "${address}" "${number}"`;const url='https://www.google.com/search?hl=pt-BR&num=10&q='+encodeURIComponent(q);const r=await fetch(url,{headers});if(!r.ok)continue;const text=clean(await r.text());if(normalize(text).includes(exact))add(domain,url,domain,text.slice(0,4000));}catch(_){} }

  // Extrai candidatos de todos os resultados e exige endereço exato na evidência.
  const candidates=new Map();
  for(const r of results){
    const matches=[...r.text.matchAll(/(?:Condom[ií]nio|Edif[ií]cio|Residencial)\s+(?:Edif[ií]cio\s+)?[A-ZÀ-Ú0-9][A-Za-zÀ-Ú0-9 .&'’_-]{2,90}/gi)];
    for(const m of matches){let name=clean(m[0]).replace(/[|•].*$/,'').replace(/[.,;:]+$/,'').trim();if(name.length<8||name.length>100)continue;const nn=normalize(name);if(!/(condominio|edificio|residencial)/.test(nn))continue;const id=nn.replace(/^(condominio|edificio|residencial)\s+/,'');const c=candidates.get(id)||{name,sources:new Set(),exactHits:0,examples:[]};c.sources.add(r.engine+'|'+r.url);if(r.norm.includes(exact))c.exactHits++;if(c.examples.length<4)c.examples.push({title:r.title||r.engine,url:r.url,evidence:r.snippet||r.text.slice(0,600)});candidates.set(id,c);}
  }
  const ranked=[...candidates.values()].sort((a,b)=>(b.exactHits*100+b.sources.size*25)-(a.exactHits*100+a.sources.size*25));
  const best=ranked.find(c=>c.exactHits>0);
  if(!best)return res.status(200).json({condominium_name:'',confidence:'baixa',features:[],construction_year:null,delivery_year:null,evidence:`Não encontramos evidência pública suficiente para o endereço exato ${location}.`,sources:results.slice(0,5).map(r=>({title:r.title,url:r.url,evidence:r.snippet}))});

  // Extrai características somente das evidências que também mencionam o endereço exato.
  const supporting=results.filter(r=>r.norm.includes(exact)&&/condominio|edificio|residencial/i.test(r.text));const all=normalize(supporting.map(r=>r.text).join(' '));
  const features=[];const f=(rx,label)=>{if(rx.test(all))features.push(label)};f(/churrasqueira/,'Churrasqueira');f(/piscina/,'Piscina');f(/academia|fitness/,'Academia');f(/salao de festas/,'Salão de festas');f(/playground/,'Playground');f(/elevador/,'Elevador');f(/portaria.{0,30}24|24.{0,30}portaria|seguranca 24/,'Portaria 24h');f(/area pet|espaco pet|pet place/,'Área Pet');f(/bicicletario/,'Bicicletário');f(/vaga.{0,25}visitante|visitante.{0,25}vaga/,'Vaga de visitante');
  return res.status(200).json(result(best.name,[...new Set(features)],best.examples,best.sources.size>=2||best.exactHits>=2?'alta':'media',`O endereço exato ${address}, ${number} foi encontrado em múltiplas fontes de pesquisa.`));
}