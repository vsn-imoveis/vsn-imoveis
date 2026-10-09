const https = require("https");
const http = require("http");
function send(res,status,data){res.setHeader("Content-Type","application/json; charset=utf-8");res.setHeader("Cache-Control","no-store");return res.status(status).json(data);}
function decode(s){return String(s||"").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).trim();}
function plain(s){return decode(String(s||"").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," "));}
function meta(html,key){const safe=key.replace(/[.*+?^\${}()|[\]\\]/g,"\\$&");for(const re of [new RegExp('<meta[^>]+(?:property|name)=["\\']'+safe+'["\\'][^>]+content=["\\']([^"\\']*)["\\'][^>]*>','i'),new RegExp('<meta[^>]+content=["\\']([^"\\']*)["\\'][^>]+(?:property|name)=["\\']'+safe+'["\\'][^>]*>','i')]){const m=html.match(re);if(m)return decode(m[1]);}return "";}
function embeddedData(html){
 const out=[];
 const walk=(x,depth=0)=>{if(!x||depth>12)return;if(Array.isArray(x)){x.slice(0,3000).forEach(v=>walk(v,depth+1));return;}if(typeof x!=="object")return;out.push(x);Object.keys(x).forEach(k=>{if(x[k]&&typeof x[k]==="object")walk(x[k],depth+1);});};
 const re=/<script([^>]*)>([\\s\\S]*?)<\\/script>/gi;let m;
 while((m=re.exec(html))){
  const attrs=m[1]||"",body=m[2]||"";
  const isJsonLd=/type=["']application\\/ld\\+json["']/i.test(attrs);
  const isJson=/type=["']application\\/json["']/i.test(attrs);
  const isState=/__NEXT_DATA__|__INITIAL_STATE__|__APOLLO_STATE__|__NUXT__|__PRELOADED_STATE__/i.test(attrs+" "+body.slice(0,300));
  if(!isJsonLd&&!isJson&&!isState)continue;
  try{let raw=body.trim().replace(/^<!--|-->$/g,"").trim();if(raw.length>3000000)continue;walk(JSON.parse(raw));}catch(_){}
 }
 return out;
}
function valueFrom(nodes,keys){
 for(const n of nodes){for(const k of keys){const v=n?.[k];if(v!==undefined&&v!==null&&v!==""&&typeof v!=="object")return v;}}
 return null;
}
function imageValues(nodes){
 const out=[];const add=v=>{if(typeof v==="string"&&/^https?:\\/\\//i.test(v)&&!out.includes(v))out.push(v);else if(v&&typeof v==="object"){add(v.url);add(v.contentUrl);add(v.src);}};
 for(const n of nodes){add(n.image);add(n.images);add(n.thumbnailUrl);add(n.photo);add(n.photos);add(n.coverImage);add(n.mainImage);}
 return out;
}
function num(v){if(v===null||v===undefined||v==="")return null;if(typeof v==="number")return v;const s=String(v).replace(/[^\d,.-]/g,"");if(!s)return null;let n;if(s.includes(",")&&s.includes("."))n=Number(s.lastIndexOf(",")>s.lastIndexOf(".")?s.replace(/\./g,"").replace(",","."):s.replace(/,/g,""));else n=Number(s.replace(",","."));return Number.isFinite(n)?n:null;}
function find(t,re){const m=String(t||"").match(re);return m?m[1].trim():"";}
module.exports=async function(req,res){
 if(req.method!=="POST")return send(res,405,{error:"Método não permitido."});
 try{
  const raw=String(req.body?.url||"").trim();let u;try{u=new URL(raw);}catch(_){return send(res,400,{error:"Informe um link válido."});}
  if(!["http:","https:"].includes(u.protocol)||u.username||u.password)return send(res,400,{error:"O link deve usar HTTP ou HTTPS."});
  function safeTarget(target){const h=target.hostname.toLowerCase();if(!["http:","https:"].includes(target.protocol)||target.username||target.password||h==="localhost"||h.endsWith(".localhost")||h==="127.0.0.1"||h==="::1"||h==="0.0.0.0"||/^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h))throw new Error("O link redirecionou para um endereço não permitido.");}
  async function fetchHtml(target,redirects=0){safeTarget(target);if(redirects>5)throw new Error("O anúncio redirecionou muitas vezes.");const client=target.protocol==="https:"?https:http;return await new Promise((resolve,reject)=>{const rq=client.get(target,{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36","Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8","Accept-Language":"pt-BR,pt;q=0.9,en;q=0.8"},timeout:15000},rp=>{if(rp.statusCode>=300&&rp.statusCode<400&&rp.headers.location){rp.resume();let next;try{next=new URL(rp.headers.location,target);}catch(_){return reject(new Error("O site enviou um redirecionamento inválido."));}return fetchHtml(next,redirects+1).then(resolve,reject);}if(rp.statusCode<200||rp.statusCode>=300){rp.resume();return reject(new Error("O portal bloqueou ou recusou a leitura (HTTP "+rp.statusCode+")."));}if(!String(rp.headers["content-type"]||"").toLowerCase().includes("html")){rp.resume();return reject(new Error("O link não retornou uma página HTML."));}let d="";rp.setEncoding("utf8");rp.on("data",c=>{d+=c;if(d.length>4000000)rq.destroy(new Error("Página muito grande para importar."));});rp.on("end",()=>resolve(d));});rq.on("timeout",()=>rq.destroy(new Error("Tempo limite ao acessar o anúncio.")));rq.on("error",reject);});}
  safeTarget(u);const html=await fetchHtml(u);
  const nodes=embeddedData(html);
  const p=nodes.find(x=>/Product|Residence|Apartment|House|SingleFamilyResidence|RealEstateListing|Accommodation/i.test(String(x["@type"]||""))||x.floorSize||x.numberOfBedrooms||x.address)||{};
  const o=Array.isArray(p.offers)?p.offers[0]:(p.offers||{});
  const a=p.address||valueFrom(nodes,["address","streetAddress"])||{};
  const title=p.name||valueFrom(nodes,["headline","title","name"])||meta(html,"og:title")||meta(html,"twitter:title")||find(html,/<title[^>]*>([\s\S]*?)<\/title>/i);
  const description=p.description||valueFrom(nodes,["description","summary"])||meta(html,"og:description")||meta(html,"description")||"";
  const price=num(o.price||valueFrom(nodes,["price","salePrice","rentalPrice","rentPrice","value"])||meta(html,"product:price:amount")||find(plain(html),/(R\$\s*[\d.]+(?:,[\d]{2})?)/i));
  const text=plain(description+" "+title), images=[];
  const add=x=>{const v=typeof x==="string"?x:x?.url;if(v&&/^https?:\/\//i.test(v)&&!images.includes(v))images.push(v);};
  (Array.isArray(p.image)?p.image:[p.image]).forEach(add);imageValues(nodes).forEach(add);add(meta(html,"og:image"));add(meta(html,"twitter:image"));
  const imgRe=/<img[^>]+(?:src|data-src)=["']([^"']+)["']/gi;let im;while((im=imgRe.exec(html))&&images.length<35){const v=decode(im[1]);if(/^https?:\\/\\//i.test(v)&&/\\.(?:jpe?g|png|webp)(?:[?#]|$)/i.test(v))add(v);}
  const full=typeof a==="string"?a:[a.streetAddress,a.addressLocality,a.addressRegion].filter(Boolean).join(", ");
  const rent=/alug|loca[cç][aã]o/i.test(title+" "+description);
  const result={title:plain(title).slice(0,220),description:plain(description).slice(0,8000),price:rent?null:price,rent_price:rent?price:null,transaction_type:rent?"rent":"sale",area:num(p.floorSize?.value||p.floorSize||valueFrom(nodes,["area","usableArea","privateArea","totalArea","livingArea"])||find(text,/([\d.,]+)\s*m(?:²|2|etros quadrados)/i)),bedrooms:num(p.numberOfBedrooms||valueFrom(nodes,["bedrooms","bedroomCount","dormitorios","quartos"])||find(text,/(\d+)\s*(?:quartos?|dormitórios?)/i)),suites:num(valueFrom(nodes,["suites","suiteCount"])||find(text,/(\d+)\s*s[uú]ites?/i)),bathrooms:num(p.numberOfBathroomsTotal||valueFrom(nodes,["bathrooms","bathroomCount","banheiros"])||find(text,/(\d+)\s*banheiros?/i)),parking:num(valueFrom(nodes,["parkingSpaces","parking","garageSpaces","vagas"])||find(text,/(\d+)\s*(?:vagas?|garagens?)/i)),address:a.streetAddress||full||find(text,/(?:Rua|Avenida|Av\.?|Alameda|Estrada)\s+[^,\n]+/i),number:a.streetAddress?find(a.streetAddress,/[, ]+(\d+[A-Za-z]?)(?:\s|$)/):find(text,/(?:n[úu]mero|n[º°.]?)\s*(\d+[A-Za-z]?)/i),cep:a.postalCode||find(text,/(\d{5}-?\d{3})/),neighborhood:a.addressNeighborhood||a.neighborhood||"",city:a.addressLocality||"",state:a.addressRegion||"",condominium_name:"",photos:images.slice(0,35),source_url:u.toString()};
  if(![result.title,result.description,result.price,result.area,result.address].some(v=>v!==null&&v!==undefined&&v!=="")){
   const plainPage=plain(html).slice(0,1200).toLowerCase();
   if(/captcha|verifique se você é humano|access denied|acesso negado|cloudflare|robot check/.test(plainPage))return send(res,422,{error:"O portal bloqueou a leitura automática (proteção antirobô)."});
   return send(res,422,{error:"A página abriu, mas o portal não entregou dados estruturados suficientes. Pode carregar os dados por JavaScript ou exigir integração específica."});
  }
  return send(res,200,result);
 }catch(e){return send(res,422,{error:e.message||"Não foi possível ler o anúncio. O site pode bloquear acessos automáticos."});}
};
