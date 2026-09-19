export default async function handler(req,res){
  res.setHeader("Content-Type","application/json; charset=utf-8");
  const send=(data,status=200)=>res.status(status).json(data);
  if(req.method!=="POST") return send({error:"Método não permitido"},405);

  try{
    const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
    const address=String(body.address||"").trim();
    const number=String(body.number||"").trim();
    const neighborhood=String(body.neighborhood||"").trim();
    const city=String(body.city||"").trim();
    const state=String(body.state||"").trim();
    const cep=String(body.cep||"").trim();

    if(!address||!number) return send({error:"Informe endereço e número."},400);

    const fullAddress=[address,number,neighborhood,city,state,cep].filter(Boolean).join(", ");
    const query='"'+address+" "+number+'" condomínio';
    const url="https://www.google.com/search?q="+encodeURIComponent(query)+"&hl=pt-BR&num=10";

    const response=await fetch(url,{
      headers:{
        "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153 Safari/537.36",
        "Accept-Language":"pt-BR,pt;q=0.9"
      }
    });

    const html=await response.text();
    const text=html
      .replace(/<script[\s\S]*?<\/script>/gi," ")
      .replace(/<style[\s\S]*?<\/style>/gi," ")
      .replace(/<[^>]+>/g," ")
      .replace(/&quot;/g,'"')
      .replace(/&#39;/g,"'")
      .replace(/&amp;/g,"&")
      .replace(/&nbsp;/g," ")
      .replace(/\s+/g," ")
      .trim();

    const normalized=text.toLowerCase();
    const addressParts=address.toLowerCase().replace(/^rua\s+/i,"").split(/\s+/).filter(x=>x.length>=4);
    const numberNeedle=number.toLowerCase();
    const snippets=[];
    let cursor=0;

    while(snippets.length<10){
      const idx=normalized.indexOf(numberNeedle,cursor);
      if(idx<0) break;
      const start=Math.max(0,idx-300);
      const end=Math.min(text.length,idx+500);
      const snippet=text.slice(start,end);
      const hasStreet=addressParts.some(part=>snippet.toLowerCase().includes(part));
      if(hasStreet && !snippets.includes(snippet)) snippets.push(snippet);
      cursor=idx+numberNeedle.length;
    }

    return send({
      ok:response.ok,
      http_status:response.status,
      searched_address:fullAddress,
      query,
      source:"Google Search",
      snippets,
      result_count:snippets.length,
      raw_preview:text.slice(0,5000)
    });
  }catch(error){
    return send({
      error:"Erro na consulta externa.",
      message:String(error&&error.message||error)
    },500);
  }
}