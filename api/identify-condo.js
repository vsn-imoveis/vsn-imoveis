export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método não permitido'});
  const {address,number,cep,neighborhood,city,state}=req.body||{};
  if(!address||!number) return res.status(400).json({error:'Informe endereço e número.'});
  if(!process.env.OPENAI_API_KEY) return res.status(503).json({error:'OPENAI_API_KEY não configurada no Vercel.'});
  const location=[address,number,neighborhood,city,state,cep].filter(Boolean).join(', ');
  const prompt=`Você é um pesquisador imobiliário. Identifique o condomínio residencial associado ao endereço abaixo usando busca na web. Não invente dados. Endereço: ${location}. Procure o nome exato do condomínio e características/amenidades publicamente divulgadas. Só marque uma amenidade se houver evidência razoável em uma fonte. Se houver mais de um resultado possível, escolha o mais provável e informe confiança baixa/média/alta. Retorne SOMENTE JSON válido neste formato: {"condominium_name":"","confidence":"alta|media|baixa","features":[],"evidence":"","sources":[{"title":"","url":""}]}. features deve usar apenas estes valores quando confirmados: Mobiliado,Varanda,Churrasqueira,Piscina,Academia,Salão de festas,Playground,Elevador,Portaria 24h,Aceita pets. O fato de o condomínio ter uma área comum não significa que o apartamento seja mobiliado ou tenha varanda; diferencie amenidades do condomínio de características da unidade.`;
  try{
    const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({model:'gpt-5.6-luna',tools:[{type:'web_search'}],input:prompt})});
    const j=await r.json();
    if(!r.ok) return res.status(502).json({error:j?.error?.message||'Falha na consulta web.'});
    let text=j.output_text||''; text=text.replace(/^```json\s*/,'').replace(/\s*```$/,'').trim();
    const data=JSON.parse(text);
    return res.status(200).json(data);
  }catch(e){return res.status(500).json({error:e.message||'Falha ao identificar condomínio.'});}
}
