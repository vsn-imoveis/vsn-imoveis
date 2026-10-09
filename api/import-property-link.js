const https = require("https");
const http = require("http");
function send(res,status,data){res.setHeader("Content-Type","application/json; charset=utf-8");res.setHeader("Cache-Control","no-store");return res.status(status).json(data);}
function decode(s){return String(s||"").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).trim();}
function plain(s){return decode(String(s||"").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," "));}
function meta(html,key){const safe=key.replace(/[.*+?^\${}()|[\]\\]/g,"\\$&");for(const re of [new RegExp('<meta[^>]+(?:property|name)=["\\']'+safe+'["\\'][^>]+content=["\\']([^"\\']*)["\\'][^>]*>','i'),new RegExp('<meta[^>]+content=["\\']([^"\\']*)["\\'][^>]+(?:property|name)=["\\']'+safe+'["\\'][^>]*>','i')]){const m=html.match(re);if(m)return decode(m[1]);}return "";}
function jsonLd(html){const out=[];const re=/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;let m;while((m=re.exec(html))){try{const v=JSON.parse(m[1].trim());const walk=x=>{if(!x)return;if(Array.isArray(x))return x.forEach(walk);if(typeof x!=="object")return;out.push(x);if(x["@graph"])walk(x["@graph"]);if(x.itemListElement)walk(x.itemListElement);};walk(v);}catch(_){}}return out;}
function num(v){if(v===null||v===undefined||v==="")return null;if(typeof v==="number")return v;const s=String(v).replace(/[^\d,.-]/g,"");if(!s)return null;let n;if(s.includes(",")&&s.includes("."))n=Number(s.lastIndexOf(",")>s.lastIndexOf(".")?s.replace(/\./g,"").replace(",","."):s.replace(/,/g,""));else n=Number(s.replace(",","."));return Number.isFinite(n)?n:null;}
function find(t,re){const m=String(t||"").match(re);return m?m[1].trim():"";}
module.exports=async function(req,res){
 if(req.method!=="POST")return send(res,405,{error:"Método não permitido."});
 try{
  const raw=String(req.body?.url||"").trim();let u;try{u=new URL(raw);}catch(_){return send(res,400,{error:"Informe um link válido."});}
  if(!["http:","https:"].includes(u.protocol)||u.username||u.password)return send(res,400,{error:"O link deve usar HTTP ou HTTPS."});
  const host=u.hostname.toLowerCase();if(host==="localhost"||host.endsWith(".localhost")||host==="127.0.0.1"||host==="::1"||/^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host))return send(res,400,{error:"Esse endereço não pode ser acessado."});
  const client=u.protocol==="https:"?https:http;
  const html=await new Promise((resolve,reject)=>{const rq=client.get(u,{headers:{"User-Agent":"Mozilla/5.0 (compatible; VSNImoveisImporter/1.0)","Accept":"text/html,application/xhtml+xml"},timeout:12000},rp=>{if(rp.statusCode>=300&&rp.statusCode<400&&rp.headers.location){rp.resume();return reject(new Error("O site redirecionou o acesso; tente o link público direto do anúncio."));}if(rp.statusCode<200||rp.statusCode>=300){rp.resume();return reject(new Error("O site respondeu com status "+rp.statusCode+"."));}if(!String(rp.headers["content-type"]||"").includes("html")){rp.resume();return reject(new Error("O link não retornou uma página HTML."));}let d="";rp.setEncoding("utf8");rp.on("data",c=>{d+=c;if(d.length>4000000)rq.destroy(new Error("Página muito grande para importar."));});rp.on("end",()=>resolve(d));});rq.on("timeout",()=>rq.destroy(new Error("Tempo limite ao acessar o anúncio.")));rq.on("error",reject);});
  const nodes=jsonLd(html),p=nodes.find(x=>/Product|Residence|Apartment|House|SingleFamilyResidence|RealEstateListing/i.test(String(x["@type"]||"")))||{},o=Array.isArray(p.offers)?p.offers[0]:(p.offers||{}),a=p.address||{};
  const title=p.name||meta(html,"og:title")||meta(html,"twitter:title")||find(html,/<title[^>]*>([\s\S]*?)<\/title>/i);
  const description=p.description||meta(html,"og:description")||meta(html,"description")||"";
  const price=num(o.price||meta(html,"product:price:amount")||find(plain(html),/(R\$\s*[\d.]+(?:,[\d]{2})?)/i));
  const text=plain(description+" "+title), images=[];
  const add=x=>{const v=typeof x==="string"?x:x?.url;if(v&&/^https?:\/\//i.test(v)&&!images.includes(v))images.push(v);};
  (Array.isArray(p.image)?p.image:[p.image]).forEach(add);add(meta(html,"og:image"));
  const full=typeof a==="string"?a:[a.streetAddress,a.addressLocality,a.addressRegion].filter(Boolean).join(", ");
  const rent=/alug|loca[cç][aã]o/i.test(title+" "+description);
  const result={title:plain(title).slice(0,220),description:plain(description).slice(0,8000),price:rent?null:price,rent_price:rent?price:null,transaction_type:rent?"rent":"sale",area:num(p.floorSize?.value||p.floorSize||find(text,/([\d.,]+)\s*m(?:²|2|etros quadrados)/i)),bedrooms:num(p.numberOfBedrooms||find(text,/(\d+)\s*(?:quartos?|dormitórios?)/i)),suites:num(find(text,/(\d+)\s*s[uú]ites?/i)),bathrooms:num(p.numberOfBathroomsTotal||find(text,/(\d+)\s*banheiros?/i)),parking:num(find(text,/(\d+)\s*(?:vagas?|garagens?)/i)),address:a.streetAddress||full||find(text,/(?:Rua|Avenida|Av\.?|Alameda|Estrada)\s+[^,\n]+/i),number:a.streetAddress?find(a.streetAddress,/[, ]+(\d+[A-Za-z]?)(?:\s|$)/):find(text,/(?:n[úu]mero|n[º°.]?)\s*(\d+[A-Za-z]?)/i),cep:a.postalCode||find(text,/(\d{5}-?\d{3})/),neighborhood:a.addressNeighborhood||a.neighborhood||"",city:a.addressLocality||"",state:a.addressRegion||"",condominium_name:"",photos:images.slice(0,35),source_url:u.toString()};
  if(![result.title,result.description,result.price,result.area,result.address].some(v=>v!==null&&v!==undefined&&v!==""))return send(res,422,{error:"O site não expôs dados suficientes. Pode exigir integração específica."});
  return send(res,200,result);
 }catch(e){return send(res,422,{error:e.message||"Não foi possível ler o anúncio. O site pode bloquear acessos automáticos."});}
};
