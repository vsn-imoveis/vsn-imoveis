export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método não permitido'});
  try{
    const {address='',number='',neighborhood='',city='São Paulo',state='SP',cep=''}=req.body||{};
    if(!address && !cep)return res.status(400).json({error:'Endereço ou CEP não informado'});

    const fullAddress=[address,number,neighborhood,city,state,cep,'Brasil'].filter(Boolean).join(', ');
    const googleKey=process.env.GOOGLE_MAPS_API_KEY;

    // Preferência: Google Places + Routes, usando o endereço/CEP exato.
    // Se a chave não estiver configurada, mantém fallback público pelo OSM.
    if(googleKey){
      const geo=await googleGeocode(fullAddress,googleKey);
      if(geo){
        const categories=[
          ['Supermercados','supermercado'],
          ['Farmácias','farmácia'],
          ['Educação','escola'],
          ['Saúde','hospital ou clínica ou UBS'],
          ['Transporte','ponto de ônibus ou estação de metrô'],
          ['Padarias','padaria'],
          ['Alimentação','restaurante'],
          ['Academias','academia'],
          ['Bancos','banco'],
          ['Comércio','shopping ou centro comercial']
        ];

        const all=[];
        for(const [category,query] of categories){
          try{
            const places=await googleTextSearch(query+' perto de '+fullAddress,geo,googleKey);
            for(const p of places)all.push({...p,category});
          }catch(_){}
        }

        const unique=[];
        const seen=new Set();
        for(const p of all){
          const key=p.id||((p.name||'')+'|'+(p.address||'')).toLowerCase();
          if(seen.has(key))continue;
          seen.add(key);
          unique.push(p);
        }

        const routed=await googleWalkingDistances(geo,unique.slice(0,40),googleKey);
        const places=routed
          .filter(p=>Number.isFinite(p.distance)&&p.distance<=800)
          .sort((a,b)=>a.distance-b.distance)
          .slice(0,30);

        return res.status(200).json({
          source:'google_places_routes',
          radius_meters:800,
          distance_mode:'walking_route',
          places,
          coordinates:{lat:geo.lat,lon:geo.lon}
        });
      }
    }

    return await osmFallback(fullAddress,res);
  }catch(e){
    return res.status(500).json({error:'Falha ao consultar a localização.'});
  }
}

async function googleGeocode(address,key){
  const url='https://maps.googleapis.com/maps/api/geocode/json?address='+encodeURIComponent(address)+'&language=pt-BR&region=br&key='+encodeURIComponent(key);
  const r=await fetch(url);
  if(!r.ok)return null;
  const j=await r.json();
  const l=j?.results?.[0]?.geometry?.location;
  return l&&Number.isFinite(Number(l.lat))&&Number.isFinite(Number(l.lng))?{lat:Number(l.lat),lon:Number(l.lng)}:null;
}

async function googleTextSearch(query,center,key){
  const r=await fetch('https://places.googleapis.com/v1/places:searchText',{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'X-Goog-Api-Key':key,
      'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.location'
    },
    body:JSON.stringify({
      textQuery:query,
      languageCode:'pt-BR',
      regionCode:'BR',
      pageSize:4,
      locationBias:{circle:{center:{latitude:center.lat,longitude:center.lon},radius:800}}
    })
  });
  if(!r.ok)return [];
  const j=await r.json();
  return (j.places||[]).map(p=>({
    id:p.id,
    name:p.displayName?.text||'',
    address:p.formattedAddress||'',
    lat:Number(p.location?.latitude),
    lon:Number(p.location?.longitude)
  })).filter(p=>p.name&&Number.isFinite(p.lat)&&Number.isFinite(p.lon));
}

async function googleWalkingDistances(origin,places,key){
  if(!places.length)return [];
  const r=await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'X-Goog-Api-Key':key,
      'X-Goog-FieldMask':'originIndex,destinationIndex,distanceMeters,duration,status,condition'
    },
    body:JSON.stringify({
      origins:[{waypoint:{location:{latLng:{latitude:origin.lat,longitude:origin.lon}}}}],
      destinations:places.map(p=>({waypoint:{location:{latLng:{latitude:p.lat,longitude:p.lon}}})),
      travelMode:'WALK',
      languageCode:'pt-BR',
      units:'METRIC'
    })
  });
  if(!r.ok)return [];
  const raw=await r.text();
  let data=[];
  try{data=JSON.parse(raw)}catch(_){
    data=raw.split('\n').filter(Boolean).map(x=>{try{return JSON.parse(x)}catch(_){return null}}).filter(Boolean);
  }
  return data.map(x=>{
    const p=places[Number(x.destinationIndex)];
    if(!p||x.condition!=='ROUTE_EXISTS'||!Number.isFinite(Number(x.distanceMeters)))return null;
    return {...p,distance:Number(x.distanceMeters)};
  }).filter(Boolean);
}

async function osmFallback(q,res){
  const geoUrl='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q='+encodeURIComponent(q);
  const geoRes=await fetch(geoUrl,{headers:{'User-Agent':'VSN-Imoveis/1.0'}});
  if(!geoRes.ok)return res.status(200).json({places:[],source:'osm_fallback'});
  const geo=await geoRes.json();
  if(!geo?.[0])return res.status(200).json({places:[],source:'osm_fallback'});
  const lat=Number(geo[0].lat),lon=Number(geo[0].lon);
  const query='[out:json][timeout:12];(nwr(around:800,'+lat+','+lon+')[name][amenity~"school|kindergarten|college|university|hospital|clinic|pharmacy|restaurant|bank|fuel|gym|marketplace"];nwr(around:800,'+lat+','+lon+')[name][shop~"supermarket|mall|convenience|bakery|department_store"];nwr(around:800,'+lat+','+lon+)[name][highway="bus_stop"];nwr(around:800,'+lat+','+lon+)[name][railway~"station|subway_entrance|halt|tram_stop"];nwr(around:800,'+lat+','+lon+)[name][leisure~"park|fitness_centre"];);out center tags;';
  const r=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'text/plain','User-Agent':'VSN-Imoveis/1.0'},body:query});
  if(!r.ok)return res.status(200).json({places:[],source:'osm_fallback'});
  const j=await r.json();
  const places=(j.elements||[]).map(el=>{
    const t=el.tags||{},elat=Number(el.lat??el.center?.lat),elon=Number(el.lon??el.center?.lon);
    if(!t.name||!Number.isFinite(elat)||!Number.isFinite(elon))return null;
    return {name:t.name,category:category(t),distance:distance(lat,lon,elat,elon)};
  }).filter(Boolean).filter(p=>p.distance<=800).sort((a,b)=>a.distance-b.distance);
  return res.status(200).json({source:'osm_fallback',radius_meters:800,distance_mode:'straight_line_fallback',places,coordinates:{lat,lon}});
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
  if(t.shop==='bakery')return 'Padarias';
  if(t.leisure==='park')return 'Lazer';
  return 'Outros';
}
function distance(a,b,c,d){
  const R=6371000,r=x=>x*Math.PI/180,dl=r(c-a),dn=r(d-b);
  const x=Math.sin(dl/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(dn/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}