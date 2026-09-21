export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método não permitido'});
  try{
    const {address='',number='',neighborhood='',city='São Paulo',state='SP'}=req.body||{};
    const q=[address,number,neighborhood,city,state,'Brasil'].filter(Boolean).join(', ');
    if(!address)return res.status(400).json({error:'Endereço não informado'});
    const geoUrl='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q='+encodeURIComponent(q);
    const geoRes=await fetch(geoUrl,{headers:{'User-Agent':'VSN-Imoveis/1.0'}});
    if(!geoRes.ok)return res.status(502).json({error:'Não foi possível localizar o endereço.'});
    const geo=await geoRes.json();
    if(!geo?.[0])return res.status(404).json({error:'Endereço não localizado.'});
    const lat=Number(geo[0].lat),lon=Number(geo[0].lon);
    const query='[out:json][timeout:12];(nwr(around:1500,'+lat+','+lon+')[name][amenity~"school|kindergarten|college|university|hospital|clinic|pharmacy|restaurant|bank|fuel|gym|marketplace"];nwr(around:1500,'+lat+','+lon+')[name][shop~"supermarket|mall|convenience|bakery|department_store"];nwr(around:1500,'+lat+','+lon+')[name][highway="bus_stop"];nwr(around:1500,'+lat+','+lon+)[name][railway~"station|subway_entrance|halt|tram_stop"];nwr(around:1500,'+lat+','+lon+)[name][leisure~"park|fitness_centre"];);out center tags;';
    const r=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'text/plain','User-Agent':'VSN-Imoveis/1.0'},body:query});
    if(!r.ok)return res.status(200).json({places:[],message:'Localização encontrada, mas os serviços próximos não puderam ser consultados.'});
    const j=await r.json();
    const places=(j.elements||[]).map(el=>{
      const t=el.tags||{}, elat=Number(el.lat??el.center?.lat),elon=Number(el.lon??el.center?.lon);
      if(!t.name||!Number.isFinite(elat)||!Number.isFinite(elon))return null;
      return {name:t.name,category:category(t),distance:distance(lat,lon,elat,elon)};
    }).filter(Boolean).sort((a,b)=>a.distance-b.distance);
    const wanted=['Transporte','Supermercados','Educação','Saúde','Farmácias','Comércio','Lazer'];
    const out=[]; const seen=new Set();
    for(const p of places){
      if(!wanted.includes(p.category))continue;
      const key=p.category+'|'+p.name.toLowerCase();
      if(seen.has(key))continue;
      seen.add(key);
      if(out.filter(x=>x.category===p.category).length<2)out.push(p);
    }
    return res.status(200).json({places:out,coordinates:{lat,lon}});
  }catch(e){return res.status(500).json({error:'Falha ao consultar a localização.'})}
}
function category(t){
  if(['school','kindergarten','college','university'].includes(t.amenity))return 'Educação';
  if(['hospital','clinic'].includes(t.amenity))return 'Saúde';
  if(t.amenity==='pharmacy')return 'Farmácias';
  if(t.amenity==='restaurant')return 'Alimentação';
  if(t.amenity==='bank')return 'Bancos';
  if(t.amenity==='fuel')return 'Combustível';
  if(t.amenity==='gym'||t.leisure==='fitness_centre')return 'Academias';
  if(t.shop==='supermarket'||t.amenity==='marketplace')return 'Supermercados';
  if(t.shop==='mall'||t.shop==='department_store')return 'Comércio';
  if(t.highway==='bus_stop'||['station','subway_entrance','halt','tram_stop'].includes(t.railway))return 'Transporte';
  if(t.leisure==='park')return 'Lazer';
  return 'Outros';
}
function distance(a,b,c,d){
  const R=6371000,r=x=>x*Math.PI/180,dl=r(c-a),dn=r(d-b);
  const x=Math.sin(dl/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(dn/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}