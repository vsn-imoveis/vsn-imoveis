const https = require("https");
const http = require("http");
function send(res,status,data){res.setHeader("Content-Type","application/json; charset=utf-8");res.setHeader("Cache-Control","no-store");return res.status(status).json(data);}
function decode(s){return String(s||"").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).trim();}
function plain(s){return decode(String(s||"").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," "));}
function meta(html,key){
 const tags=String(html||"").match(/<meta\b[^>]*>/gi)||[];
 const attr=(tag,name)=>{const re=new RegExp("\\b"+name+"\\s*=\\s*([\"'])(.*?)\\1","i");const m=tag.match(re);return m?decode(m[2]):"";};
 for(const tag of tags){const ident=attr(tag,"property")||attr(tag,"name")||attr(tag,"itemprop");if(ident.toLowerCase()===String(key).toLowerCase()){const val=attr(tag,"content");if(val)return val;}}
 return "";
}
function embeddedData(html){
 const out=[];const seen=new Set();
 const walk=(x,depth=0)=>{if(!x||depth>16)return;if(Array.isArray(x)){x.slice(0,5000).forEach(v=>walk(v,depth+1));return;}if(typeof x!=="object"||seen.has(x))return;seen.add(x);out.push(x);Object.keys(x).forEach(k=>{if(x[k]&&typeof x[k]==="object")walk(x[k],depth+1);});};
 const parseFragments=(raw)=>{
  let depth=0,start=-1,inString=false,escaped=false,count=0;
  for(let i=0;i<raw.length&&count<2500;i++){
   const c=raw[i];
   if(inString){if(escaped)escaped=false;else if(c==="\\")escaped=true;else if(c==='"')inString=false;continue;}
   if(c==='"'){inString=true;continue;}
   if(c==="{"){if(depth===0)start=i;depth++;}
   else if(c==="}"&&depth>0){depth--;if(depth===0&&start>=0){const chunk=raw.slice(start,i+1);if(chunk.length<2000000){try{walk(JSON.parse(chunk));count++;}catch(_){}}start=-1;}}
  }
 };
 const re=/<script([^>]*)>([\s\S]*?)<\/script>/gi;let m;
 while((m=re.exec(html))){
  const attrs=m[1]||"",body=m[2]||"";
  if(body.length>4000000)continue;
  const isJsonLd=/type=["']application\/ld\+json["']/i.test(attrs);
  const isJson=/type=["']application\/json["']/i.test(attrs);
  const isState=/__NEXT_DATA__|__INITIAL_STATE__|__APOLLO_STATE__|__NUXT__|__PRELOADED_STATE__/i.test(attrs+" "+body.slice(0,500));
  if(isJsonLd||isJson||isState){try{walk(JSON.parse(body.trim().replace(/^<!--|-->$/g,"").trim()));continue;}catch(_){}}
  // Next.js App Router streams page data through self.__next_f.push(...), not ordinary JSON script tags.
  if(/__next_f|__NEXT_DATA__|__INITIAL_STATE__|__APOLLO_STATE__|__NUXT__|__PRELOADED_STATE__|bedrooms|dormitorios|salePrice|rentPrice|floorSize|parkingSpaces|condoPrice|condominiumFee/i.test(attrs+" "+body)){
   const pushRe=/__next_f\.push\(\s*(\[[\s\S]*?\])\s*\)\s*;?/g;let pm;
   while((pm=pushRe.exec(body))){try{const arr=JSON.parse(pm[1]);if(Array.isArray(arr)){for(const item of arr){if(typeof item==="string")parseFragments(item);else if(item&&typeof item==="object")walk(item);}}}catch(_){}}
   parseFragments(body);
  }
 }
 return out;
}
function deepValue(nodes,keys){
 const wanted=new Set(keys.map(k=>String(k).toLowerCase().replace(/[^a-z0-9]/g,"")));
 for(const n of nodes){for(const [k,v] of Object.entries(n||{})){const nk=k.toLowerCase().replace(/[^a-z0-9]/g,"");if(wanted.has(nk)&&v!==null&&v!==undefined&&v!==""&&typeof v!=="object")return v;}}
 return null;
}
function propertyNode(nodes){
 let best=null,bestScore=0;
 const types=x=>Array.isArray(x["@type"])?x["@type"].join(" "):String(x["@type"]||"");
 for(const x of nodes){
  const t=types(x);
  if(/Organization|WebSite|WebPage|BreadcrumbList|PostalAddress|Person|LocalBusiness|ContactPoint|SiteNavigationElement/i.test(t)&&!/RealEstate|Residence|Apartment|House|Product/i.test(t))continue;
  const hasPropertySignals=!!(x.offers||x.price||x.salePrice||x.rentalPrice||x.rentPrice||x.floorSize||x.area||x.usableArea||x.privateArea||x.totalArea||x.numberOfBedrooms||x.bedrooms||x.bedroomCount||x.dormitorios||x.numberOfBathroomsTotal||x.parkingSpaces);
  const typedProperty=/Product|Residence|Apartment|House|SingleFamilyResidence|RealEstateListing|Accommodation|RealEstate/i.test(t);
  // An address alone is not enough: footer/contact JSON often contains a business address.
  if(!hasPropertySignals&&!typedProperty)continue;
  let score=0;
  if(typedProperty)score+=8;
  if(x.offers||x.price||x.salePrice||x.rentalPrice||x.rentPrice)score+=5;
  if(x.floorSize||x.area||x.usableArea||x.privateArea||x.totalArea)score+=4;
  if(x.numberOfBedrooms||x.bedrooms||x.bedroomCount||x.dormitorios)score+=4;
  if(x.numberOfBathroomsTotal||x.bathrooms||x.bathroomCount)score+=2;
  if(x.address&&typeof x.address==="object")score+=2;
  if(x.name||x.headline||x.title)score+=1;
  if(score>bestScore){best=x;bestScore=score;}
 }
 return best||{};
}
function valueFrom(nodes,keys){
 for(const n of nodes){for(const k of keys){const v=n?.[k];if(v!==undefined&&v!==null&&v!==""&&typeof v!=="object")return v;}}
 return null;
}
function collectFeatures(nodes,pageText="",title="",description=""){
 const out=[];const seen=new Set();
 const add=v=>{if(!v)return;if(typeof v==="string"){const x=plain(v).trim();if(x&&x.length<100&&!seen.has(x)){seen.add(x);out.push(x);}return;}if(Array.isArray(v)){v.forEach(add);return;}if(typeof v==="object"){if(typeof v.name==="string")add(v.name);else if(typeof v.value==="string")add(v.value);else if(typeof v.label==="string")add(v.label);else if(typeof v.description==="string")add(v.description);}};
 for(const n of nodes){for(const k of ["features","amenities","amenityFeature","propertyFeatures","propertyAmenities","characteristics","attributes","differentials","condominiumFeatures","leisure","facilities"]){if(n&&n[k]!==undefined)add(n[k]);}}
 // Fallback: map portal-specific labels and visible feature names to the exact options used by the VSN form.
 const canonical=[
 ["Acabamento em alto padrão",["acabamento alto padrao","alto padrao"]],
 ["Adega",["adega"]],
 ["Ambientes integrados",["ambientes integrados","integracao de ambientes"]],
 ["Aquecimento a gás",["aquecimento a gas"]],
 ["Ar Condicionado",["ar condicionado","ar-condicionado","climatizacao"]],
 ["Área de serviço",["area de servico","lavanderia"]],
 ["Banheira",["banheira"]],
 ["Blackout nas janelas",["blackout","persiana blackout"]],
 ["Box no banheiro",["box no banheiro","box de vidro"]],
 ["Churrasqueira",["churrasqueira"]],
 ["Closet",["closet"]],
 ["Copa",["copa"]],
 ["Cozinha planejada",["cozinha planejada","armarios planejados na cozinha","moveis planejados na cozinha"]],
 ["Dependência para funcionários",["dependencia de empregada","dependencia para funcionarios","quarto de empregada"]],
 ["Depósito",["deposito","despensa externa"]],
 ["Despensa",["despensa"]],
 ["Dormitório para hóspedes",["dormitorio para hospedes","quarto de hospedes"]],
 ["Eletrodomésticos",["eletrodomesticos","eletrodomesticos inclusos"]],
 ["Elevador privativo",["elevador privativo"]],
 ["Escritório",["escritorio","home office"]],
 ["Espaço gourmet",["espaco gourmet"]],
 ["Fechadura digital",["fechadura digital","fechadura eletronica"]],
 ["Garden",["garden","jardim privativo"]],
 ["Hall de entrada",["hall de entrada"]],
 ["Hidromassagem",["hidromassagem","hidro"]],
 ["Infraestrutura de ar condicionado",["infraestrutura para ar condicionado","preparacao para ar condicionado"]],
 ["Isolamento acústico",["isolamento acustico"]],
 ["Lareira",["lareira"]],
 ["Lavabo",["lavabo"]],
 ["Lavanderia",["lavanderia"]],
 ["Mobiliado",["mobiliado","totalmente mobiliado","semi mobiliado","semi-mobiliado"]],
 ["Móveis planejados",["moveis planejados","marcenaria planejada"]],
 ["Pé direito alto",["pe direito alto"]],
 ["Piscina",["piscina"]],
 ["Piso aquecido",["piso aquecido"]],
 ["Piso de cerâmica",["piso ceramica","piso de ceramica"]],
 ["Piso de granito",["piso granito","piso de granito"]],
 ["Piso de madeira",["piso madeira","piso de madeira"]],
 ["Piso de mármore",["piso marmore","piso de marmore"]],
 ["Piso laminado",["piso laminado"]],
 ["Piso porcelanato",["porcelanato","piso porcelanato"]],
 ["Quarto(s) com armário(s)",["quarto com armarios","dormitorio com armarios","armarios embutidos"]],
 ["Quarto(s) com sacada",["quarto com sacada","dormitorio com sacada"]],
 ["Reformado",["reformado","reformada","reforma recente"]],
 ["Sacada",["sacada"]],
 ["Sacada com churrasqueira",["sacada com churrasqueira","varanda com churrasqueira"]],
 ["Sauna",["sauna"]],
 ["Tanque de lavar roupa",["tanque de lavar roupa"]],
 ["Teto em gesso",["teto em gesso","sanca de gesso","forro de gesso"]],
 ["Varanda",["varanda"]],
 ["Varanda gourmet",["varanda gourmet"]],
 ["Aceita pets",["aceita pets","pet friendly","permite animais"]]
 ];
 const norm=v=>plain(String(v||"")).toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
 const corpus=norm([title,description,pageText].join(" "));
 for(const [label,aliases] of canonical){if(aliases.some(a=>{const needle=norm(a);return needle&&corpus.includes(needle);}))add(label);}
 return out.slice(0,80);
}
function inferPropertyType(nodes,title,description){
 const v=String(deepValue(nodes,["propertyType","realEstateType","property_type","typeOfUnit","unitType"])||"");
 const raw=(v+" "+title+" "+description).toLocaleLowerCase("pt-BR");
 if(/cobertura/.test(raw))return "Cobertura";
 if(/studio|est[uú]dio/.test(raw))return "Studio";
 if(/casa de condom[ií]nio|sobrado em condom[ií]nio/.test(raw))return "Casa de condomínio";
 if(/apartamento|apto\\b/.test(raw))return "Apartamento";
 if(/terreno|lote/.test(raw))return "Terreno";
 if(/sala comercial|conjunto comercial|escrit[oó]rio comercial/.test(raw))return "Sala comercial";
 if(/casa|sobrado/.test(raw))return "Casa";
 return "";
}
function imageValues(nodes){
 const out=[];const seen=new Set();const add=v=>{if(!v||seen.has(v))return;if(typeof v==="string"){seen.add(v);if(/^https?:\/\//i.test(v)&&!out.includes(v))out.push(v);return;}if(Array.isArray(v)){seen.add(v);v.forEach(add);return;}if(typeof v==="object"){seen.add(v);add(v.url);add(v.contentUrl);add(v.src);add(v.image);add(v.images);add(v.thumbnailUrl);add(v.photo);add(v.photos);add(v.content);}};
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
  const p=propertyNode(nodes);
  const o=Array.isArray(p.offers)?p.offers[0]:(p.offers||{});
  const a=p.address||{};
  const deep=(keys)=>deepValue(nodes,keys);
  const first=(...values)=>values.find(v=>v!==null&&v!==undefined&&v!=="");
  const title=first(p.name,p.headline,p.title,deep(["listingTitle","propertyTitle","displayTitle","title"]),meta(html,"og:title"),meta(html,"twitter:title"),find(html,/<title[^>]*>([\s\S]*?)<\/title>/i))||"";
  const description=first(p.description,deep(["listingDescription","propertyDescription","descriptionText","description"]),meta(html,"og:description"),meta(html,"description"))||"";
  const price=num(first(o.price,p.price,p.salePrice,p.rentalPrice,p.rentPrice,deep(["salePrice","sale_price","price","askingPrice","rentPrice","rentalPrice","monthlyRent"]),meta(html,"product:price:amount"),find(plain(html),/(R\$\s*[\d.]+(?:,[\d]{2})?)/i)));
  // Varre o texto visível inteiro: muitos portais não incluem as características no JSON-LD.
  const pageText=plain(html);
  const text=plain(description+" "+title+" "+pageText), images=[];
  const add=x=>{if(Array.isArray(x)){x.forEach(add);return;}const v=typeof x==="string"?x:(x?.url||x?.contentUrl||x?.src);if(v&&/^https?:\/\//i.test(v)&&!images.includes(v))images.push(v);};
  (Array.isArray(p.image)?p.image:[p.image]).forEach(add);imageValues(nodes).forEach(add);add(meta(html,"og:image"));add(meta(html,"twitter:image"));
  const imgRe=/<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/gi;let im;while((im=imgRe.exec(html))&&images.length<35){const v=decode(im[1]);if(/^https?:\/\//i.test(v)&&/\.(?:jpe?g|png|webp|avif)(?:[?#]|$)/i.test(v))add(v);}
  // Campos numéricos são lidos por rótulos próximos para evitar capturar números aleatórios do rodapé.
  const labeled=(labels)=>{for(const label of labels){const esc=label.replace(/ /g,"\\s+");const re=new RegExp(esc+"\\s*[:\\-]?\\s*(?:R\\$\\s*)?([\\d.]+(?:,[\\d]{1,2})?)","i");const m=pageText.match(re);if(m)return m[1];}return "";};
  const labeledArea=labeled(["área privativa","área útil","área total","metragem","área"]);
  const labeledBeds=labeled(["dormitórios","dormitório","quartos","quarto"]);
  const labeledSuites=labeled(["suítes","suíte"]);
  const labeledBaths=labeled(["banheiros","banheiro"]);
  const labeledParking=labeled(["vagas","vaga","garagens","garagem"]);
  const condoFee=num(first(p.condoPrice,p.condoFee,p.condominiumFee,p.condo_fee,deep(["condoPrice","condoFee","condominiumFee","condominiumValue","monthlyCondoFee","condo_fee"]),labeled(["condomínio","valor do condomínio","taxa condominial"])));
  const iptu=num(first(p.iptu,p.propertyTax,p.iptuValue,deep(["iptu","iptuValue","propertyTax","annualPropertyTax","taxValue"]),labeled(["iptu","iptu anual","valor do iptu"])));
  const constructionYear=num(first(p.constructionYear,p.yearBuilt,p.year_of_construction,deep(["constructionYear","yearBuilt","yearOfConstruction","builtYear"]),labeled(["ano de construção","ano de construcao","construído em","construida em"])));
  const condoMatch=pageText.match(/(?:condom[ií]nio|empreendimento)\s*[:\-]?\s*([A-ZÀ-Ú][^|•\n]{2,90})/i);
  const full=typeof a==="string"?a:[a.streetAddress,a.addressLocality,a.addressRegion].filter(Boolean).join(", ");
  const rent=/alug|loca[cç][aã]o/i.test(title+" "+description+" "+pageText.slice(0,1500));
  const propertyType=inferPropertyType(nodes,title,description);
  const features=collectFeatures(nodes,pageText,title,description);
  const result={property_type:propertyType,features,title:plain(title).slice(0,220),description:plain(description||pageText.slice(0,8000)).slice(0,8000),price:rent?null:(price||num(labeled(["preço","valor de venda","venda"]))),rent_price:rent?(price||num(labeled(["aluguel","valor da locação","valor mensal"]))):null,transaction_type:rent?"rent":"sale",area:num(first(p.floorSize?.value,p.floorSize,p.area,p.usableArea,p.privateArea,p.totalArea,p.livingArea,deep(["usableArea","privateArea","totalArea","livingArea","floorSize","area","areaM2","area_m2","squareMeters"]),labeledArea,find(text,/([\d.,]+)\s*m(?:²|2|etros quadrados)/i))),bedrooms:num(first(p.numberOfBedrooms,p.bedrooms,p.bedroomCount,p.dormitorios,p.quartos,deep(["numberOfBedrooms","bedrooms","bedroomCount","bedroomQuantity","dormitorios","quartos","rooms"]),labeledBeds,find(text,/(\d+)\s*(?:quartos?|dormitórios?)/i))),suites:num(first(p.suites,p.suiteCount,deep(["suites","suiteCount","suiteQuantity"]),labeledSuites,find(text,/(\d+)\s*s[uú]ites?/i))),bathrooms:num(first(p.numberOfBathroomsTotal,p.bathrooms,p.bathroomCount,p.banheiros,deep(["numberOfBathroomsTotal","bathrooms","bathroomCount","bathroomQuantity","banheiros"]),labeledBaths,find(text,/(\d+)\s*banheiros?/i))),parking:num(first(p.parkingSpaces,p.parking,p.garageSpaces,p.vagas,deep(["parkingSpaces","parking","garageSpaces","garageCount","parkingCount","vagas"]),labeledParking,find(text,/(\d+)\s*(?:vagas?|garagens?)/i))),condo_fee:condoFee,iptu,construction_year:constructionYear,address:a.streetAddress||"",number:a.streetAddress?find(a.streetAddress,/[, ]+(\d+[A-Za-z]?)(?:\s|$)/):"",cep:a.postalCode||"",neighborhood:a.addressNeighborhood||a.neighborhood||"",city:a.addressLocality||"",state:a.addressRegion||"",condominium_name:first(p.condominiumName,p.condoName,p.buildingName,deep(["condominiumName","condoName","buildingName","developmentName","projectName"]),condoMatch?condoMatch[1].trim().split(/\s{2,}/)[0].slice(0,90):"")||"",photos:images.slice(0,35),source_url:u.toString()}
  if(![result.title,result.description,result.price,result.area,result.address].some(v=>v!==null&&v!==undefined&&v!=="")){
   const plainPage=plain(html).slice(0,1200).toLowerCase();
   if(/captcha|verifique se você é humano|access denied|acesso negado|cloudflare|robot check/.test(plainPage))return send(res,422,{error:"O portal bloqueou a leitura automática (proteção antirobô)."});
   return send(res,422,{error:"A página abriu, mas o portal não entregou dados estruturados suficientes. Pode carregar os dados por JavaScript ou exigir integração específica."});
  }
  return send(res,200,result);
 }catch(e){return send(res,422,{error:e.message||"Não foi possível ler o anúncio. O site pode bloquear acessos automáticos."});}
};
