export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método não permitido'});
  try{
    const {address='',number='',neighborhood='',city='São Paulo',state='SP',cep=''}=req.body||{};
    if(!address&&!cep)return res.status(400).json({error:'Endereço ou CEP não informado'});

    const queryAddress=[address,number,neighborhood,city,state,cep,'Brasil'].filter(Boolean).join(', ');
    const geo=await geocode(queryAddress);
    if(!geo)return res.status(200).json({places:[],radius_meters:800,source:'osm',message:'Endereço não localizado.'});

    // Pesquisa por categorias no entorno de 800 m usando OSM/Overpass.
    const categories=[
      ['Supermercados','nwr(around:800,LAT,LON)[name][shop~"supermarket|convenience|department_store"];'],
      ['Farmácias','nwr(around:800,LAT,LON)[name][amenity="pharmacy"];'],
      ['Educação','nwr(around:800,LAT,LON)[name][amenity~"school|kindergarten|college|university"];'],
      ['Saúde','nwr(around:800,LAT,LON)[name][amenity~"hospital|clinic|doctors|dentist"];'],
      ['Transporte','nwr(around:800,LAT,LON)[name][highway="bus_stop"];nwr(around:800,LAT,LON)[name][railway~"station|subway_entrance|halt|tram_stop"];'],
      ['Padarias','nwr(around:800,LAT,LON)[name][shop="bakery"];'],
      ['Alimentação','nwr(around:800,LAT,LON)[name][amenity~"restaurant|cafe|fast_food"];'],
      ['Academias','nwr(around:800,LAT,LON)[name][leisure="fitness_centre"];nwr(around:800,LAT,LON)[name][amenity="gym"];'],
      ['Bancos','nwr(around:800,LAT,LON)[name][amenity="bank"];'],
      ['Comércio','nwr(around:800,LAT,LON)[name][shop~"mall|clothes|electronics|furniture|hardware"];']
    ];

    let all=[];
    for(const [category,fragment] of categories){
      const q='[out:json][timeout:10];('+fragment.replaceAll('LAT',String(geo.lat)).replaceAll('LON',String(geo.lon))+');out center tags;';
      try{
        const r=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'text/plain','User-Agent':'VSN-Imoveis/1.0'},body:q});
        if(!r.ok)continue;
        const j=await r.json();
        for(const el of (j.elements||[])){
          const t=el.tags||{};
          const lat=Number(el.lat??el.center?.lat),lon=Number(el.lon??el.center?.lon);
          if(!t.name||!Number.isFinite(lat)||!Number.isFinite(lon))continue;
          all.push({id:String(el.type)+'/'+String(el.id),name:t.name,category,lat,lon});
        }
      }catch(_){}
    }

    // Remove duplicados.
    const seen=new Set(), candidates=[];
    for(const p of all){
      const key=(p.name||'').trim().toLowerCase()+'|'+p.category;
      if(seen.has(key))continue;
      seen.add(key); candidates.push(p);
    }

    // Distância em linha reta só para ordenar candidatos.
    // A distância final é obtida pela rota viária no OSRM.
    candidates.forEach(p=>p.straight=distance(geo.lat,geo.lon,p.lat,p.lon));
    const nearby=candidates.filter(p=>p.straight<=1200).sort((a,b)=>a.straight-b.straight).slice(0,60);
    const routed=await routeDistances(geo,nearby);

    const places=routed
      .filter(p=>Number.isFinite(p.distance)&&p.distance<=800)
      .sort((a,b)=>a.distance-b.distance)
      .slice(0,40)
      .map(({lat,lon,straight,...p})=>p);

    return res.status(200).json({
      source:'openstreetmap_osrm',
      radius_meters:800,
      distance_mode:'walking_route',
      places,
      coordinates:{lat:geo.lat,lon:geo.lon}
    });
  }catch(e){
    return res.status(500).json({error:'Falha ao consultar a localização.'});
  }
}

async function geocode(q){
  const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q='+encodeURIComponent(q);
  const r=await fetch(url,{headers:{'User-Agent':'VSN-Imoveis/1.0 (site de imóveis)'}});
  if(!r.ok)return null;
  const j=await r.json();
  if(!j?.[0])return null;
  const lat=Number(j[0].lat),lon=Number(j[0].lon);
  return Number.isFinite(lat)&&Number.isFinite(lon)?{lat,lon}:null;
}

async function routeDistances(origin,places){
  if(!places.length)return [];
  const coords=[origin,...places].map(p=>p.lon+','+p.lat).join(';');
  const url='https://router.project-osrm.org/table/v1/driving/'+coords+'?sources=0&annotations=distance';
  try{
    const r=await fetch(url);
    if(!r.ok)return [];
    const j=await r.json();
    const row=j?.distances?.[0]||[];
    return places.map((p,i)=>{
      const d=Number(row[i+1]);
      return Number.isFinite(d)?{...p,distance:d}:null;
    }).filter(Boolean);
  }catch(_){return [];}
}
function distance(a,b,c,d){
  const R=6371000,r=x=>x*Math.PI/180,dl=r(c-a),dn=r(d-b);
  const x=Math.sin(dl/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(dn/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}