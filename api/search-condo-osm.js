export default async function handler(req,res){
  res.setHeader("Content-Type","application/json; charset=utf-8");
  const send=(data,status=200)=>res.status(status).json(data);
  if(req.method!=="POST") return send({error:"Método não permitido"},405);
  try{
    const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
    const address=String(body.address||"").trim();
    const number=String(body.number||"").trim();
    const neighborhood=String(body.neighborhood||"").trim();
    const city=String(body.city||"São Paulo").trim();
    const state=String(body.state||"SP").trim();
    const cep=String(body.cep||"").trim();
    if(!address||!number) return send({error:"Informe endereço e número."},400);

    const fullAddress=[address,number,neighborhood,city,state,cep].filter(Boolean).join(", ");
    const nominatimUrl="https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&namedetails=1&limit=10&q="+encodeURIComponent(fullAddress);
    const n=await fetch(nominatimUrl,{headers:{"User-Agent":"VSN-Imoveis/1.0 (consulta de endereços)","Accept-Language":"pt-BR"}});
    if(!n.ok) return send({error:"Nominatim retornou HTTP "+n.status,searched_address:fullAddress},502);
    const places=await n.json();

    const candidates=places.map(p=>({
      name:p.name||p.namedetails?.name||null,
      type:p.type||null,
      category:p.category||null,
      lat:p.lat||null,
      lon:p.lon||null,
      display_name:p.display_name||null,
      address:p.address||{},
      namedetails:p.namedetails||{}
    })).filter(p=>p.name||p.display_name);

    let overpassResults=[];
    if(places[0]?.lat&&places[0]?.lon){
      const lat=Number(places[0].lat),lon=Number(places[0].lon);
      const query='[out:json][timeout:20];(nwr(around:80,'+lat+','+lon+')["name"];nwr(around:80,'+lat+','+lon+')["building"];);out center tags;';
      const o=await fetch("https://overpass-api.de/api/interpreter",{method:"POST",headers:{"Content-Type":"text/plain","User-Agent":"VSN-Imoveis/1.0"},body:query});
      if(o.ok){
        const data=await o.json();
        overpassResults=(data.elements||[]).map(e=>({
          id:e.id,type:e.type,lat:e.lat??e.center?.lat,lon:e.lon??e.center?.lon,name:e.tags?.name||null,building:e.tags?.building||null,addr_street:e.tags?.["addr:street"]||null,addr_housenumber:e.tags?.["addr:housenumber"]||null
        })).filter(e=>e.name||e.building);
      }
    }

    return send({
      condominium_name:candidates[0]?.name||null,
      candidates,
      overpass:overpassResults,
      searched_address:fullAddress,
      source:"Nominatim + OpenStreetMap + Overpass",
      from_database:false,
      saved_to_database:false,
      evidence: candidates.length||overpassResults.length ? "Dados públicos do OpenStreetMap encontrados." : "Nenhum objeto nomeado encontrado no OpenStreetMap para o endereço."
    });
  }catch(error){
    return send({error:"Erro na consulta Nominatim/Overpass.",message:String(error?.message||error),candidates:[],overpass:[]},500);
  }
}