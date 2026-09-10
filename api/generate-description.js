export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método não permitido'});
  const key=process.env.OPENAI_API_KEY;
  if(!key) return res.status(503).json({error:'OPENAI_API_KEY não configurada no Vercel.'});
  try{
    const {images=[],data={}}=req.body||{};
    if(!images.length) return res.status(400).json({error:'Envie pelo menos uma foto.'});
    const content=[{type:'text',text:`Você é um redator imobiliário profissional da VSN Imóveis. Analise as fotos do imóvel e os dados fornecidos. Escreva uma descrição comercial elegante, objetiva e convincente em português do Brasil, sem inventar características que não possam ser confirmadas. Não mencione que usou IA ou fotos. Dados: tipo=${data.property_type||''}; finalidade=${data.transaction_type==='rent'?'locação':'venda'}; área=${data.area||''} m²; dormitórios=${data.bedrooms||0}; suítes=${data.suites||0}; vagas=${data.parking||0}; bairro=${data.neighborhood||''}; endereço=${data.address||''}. Gere 2 a 4 parágrafos, destacando distribuição, iluminação, ambientes, acabamento e diferenciais visíveis. Retorne somente a descrição pronta para o anúncio.`}];
    for(const url of images.slice(0,12)) content.push({type:'image_url',image_url:{url}});
    const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},body:JSON.stringify({model:'gpt-4.1-mini',messages:[{role:'user',content}],max_tokens:700,temperature:.6})});
    const j=await r.json();
    if(!r.ok) return res.status(502).json({error:j?.error?.message||'Falha ao gerar descrição.'});
    return res.status(200).json({description:j.choices?.[0]?.message?.content?.trim()||''});
  }catch(e){return res.status(500).json({error:e.message||'Erro interno'});}
}
