export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método não permitido'});
  try{
    const {data={}}=req.body||{};
    const type=String(data.property_type||'Imóvel').trim();
    const purpose=String(data.transaction_type||'').toLowerCase();
    const area=String(data.area||'').trim();
    const bedrooms=Number(data.bedrooms||0);
    const suites=Number(data.suites||0);
    const parking=Number(data.parking||0);
    const neighborhood=String(data.neighborhood||'').trim();
    const city=String(data.city||'São Paulo').trim();
    const address=String(data.address||'').trim();
    const condo=String(data.condominium_name||'').trim();
    const features=Array.isArray(data.features)?data.features.filter(Boolean).map(String):[];
    const condoFeatures=Array.isArray(data.condo_features)?data.condo_features.filter(Boolean).map(String):[];

    let purposeText='disponível para negociação';
    if(purpose==='both') purposeText='à venda e para locação';
    else if(purpose==='rent') purposeText='para locação';
    else if(purpose==='sale') purposeText='à venda';

    const typeLower=type.toLowerCase();
    const isHouse=typeLower.includes('casa');
    const article=isHouse?'Esta':'Este';
    const noun=isHouse?'casa':typeLower;

    let intro='Excelente '+type;
    if(neighborhood) intro+=' localizado'+(isHouse?'a':'')+' no bairro '+neighborhood;
    intro+=', '+purposeText+'.';

    const details=[];
    if(area) details.push(area+' m² de área útil');
    if(bedrooms) details.push(bedrooms+' '+(bedrooms===1?'dormitório':'dormitórios'));
    if(suites) details.push(suites+' '+(suites===1?'suíte':'suítes'));
    if(parking) details.push(parking+' '+(parking===1?'vaga de garagem':'vagas de garagem'));

    const p2=details.length
      ? article+' '+noun+' conta com '+formatList(details)+', oferecendo uma configuração que atende diferentes necessidades de moradia.'
      : article+' '+noun+' apresenta uma oportunidade para quem busca um imóvel no bairro'+(neighborhood?' '+neighborhood:'')+'.';

    const featureNames=features.map(x=>x.toLowerCase());
    let p3='';
    if(featureNames.length) p3='Entre os diferenciais informados estão '+formatList(featureNames)+'.';
    if(condo){
      const condoSentence='O imóvel está localizado no '+condo+'.';
      p3=p3?(p3+' '+condoSentence):condoSentence;
    }

    let p4='';
    if(condoFeatures.length) p4='A estrutura informada do condomínio inclui '+formatList(condoFeatures.map(x=>x.toLowerCase()))+'.';

    const p5=address
      ? 'Localização: '+address+(neighborhood?', '+neighborhood:'')+(city?', '+city: '')+'.'
      : (neighborhood||city
        ? 'Localizado'+(isHouse?'a':'')+(neighborhood?' no bairro '+neighborhood:'')+(city?(neighborhood?', em ':' em ')+city:'')+'.'
        : '');
 
    const description=[intro,p2,p3,p4,p5].filter(Boolean).join('\n\n').trim();
    return res.status(200).json({description});
  }catch(e){
    return res.status(500).json({error:e.message||'Erro interno'});
  }
}

async function findNearby(address,neighborhood,city){
  try{
    const query=[address,neighborhood,city,'SP','Brasil'].filter(Boolean).join(', ');
    const geoUrl='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q='+encodeURIComponent(query);
    const geoRes=await fetch(geoUrl,{headers:{'User-Agent':'VSN-Imoveis/1.0 (site imobiliario)'}});
    if(!geoRes.ok)return [];
    const geo=await geoRes.json();
    if(!geo?.[0]?.lat||!geo?.[0]?.lon)return [];
    const lat=Number(geo[0].lat),lon=Number(geo[0].lon);
    const q='[out:json][timeout:20];(nwr(around:1500,'+lat+','+lon+')[name][amenity~"school|kindergarten|college|university|hospital|clinic|pharmacy|restaurant|bank|fuel|gym|marketplace"];nwr(around:1500,'+lat+','+lon+)[name][shop~"supermarket|mall|convenience|bakery|department_store"];nwr(around:1500,'+lat+','+lon+)[name][highway="bus_stop"];nwr(around:1500,'+lat+','+lon+)[name][railway~"station|subway_entrance|halt|tram_stop"];nwr(around:1500,'+lat+','+lon+)[name][leisure~"park|fitness_centre"];);out center tags;';
    const r=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'text/plain'},body:q});
    if(!r.ok)return [];
    const j=await r.json();
    return (j.elements||[]).map(el=>{
      const tags=el.tags||{};
      const eLat=Number(el.lat??el.center?.lat),eLon=Number(el.lon??el.center?.lon);
      if(!Number.isFinite(eLat)||!Number.isFinite(eLon)||!tags.name)return null;
      return {name:tags.name,category:categoryOf(tags),distance:distanceMeters(lat,lon,eLat,eLon)};
    }).filter(Boolean).sort((a,b)=>a.distance-b.distance);
  }catch(_){return []}
}

function categoryOf(t){
  if(t.amenity==='school'||t.amenity==='kindergarten'||t.amenity==='college'||t.amenity==='university')return 'Educação';
  if(t.amenity==='hospital'||t.amenity==='clinic')return 'Saúde';
  if(t.amenity==='pharmacy')return 'Farmácias';
  if(t.amenity==='restaurant')return 'Alimentação';
  if(t.amenity==='bank')return 'Bancos';
  if(t.amenity==='fuel')return 'Combustível';
  if(t.amenity==='gym'||t.leisure==='fitness_centre')return 'Academias';
  if(t.shop==='supermarket'||t.amenity==='marketplace')return 'Supermercados';
  if(t.shop==='mall'||t.shop==='department_store')return 'Comércio';
  if(t.highway==='bus_stop'||t.railway==='station'||t.railway==='subway_entrance'||t.railway==='halt'||t.railway==='tram_stop')return 'Transporte';
  if(t.leisure==='park')return 'Lazer';
  return 'Outros';
}

function buildLocationText(items,neighborhood,city){
  const wanted=['Transporte','Supermercados','Educação','Saúde','Farmácias','Comércio','Lazer','Alimentação','Academias'];
  const groups={};
  for(const x of items){
    if(!wanted.includes(x.category))continue;
    groups[x.category]??=[];
    if(groups[x.category].some(y=>y.name.toLowerCase()===x.name.toLowerCase()))continue;
    if(groups[x.category].length<2)groups[x.category].push(x);
  }
  const sentences=[];
  const phrase=(x)=>x.name+' ('+formatDistance(x.distance)+')';
  if(groups.Transporte?.length)sentences.push('há opções de transporte como '+groups.Transporte.map(phrase).join(' e'));
  if(groups.Supermercados?.length)sentences.push('supermercados como '+groups.Supermercados.map(phrase).join(' e'));
  if(groups.Educação?.length)sentences.push('escolas e instituições de ensino como '+groups.Educação.map(phrase).join(' e'));
  if(groups.Saúde?.length)sentences.push('serviços de saúde como '+groups.Saúde.map(phrase).join(' e'));
  if(groups.Farmácias?.length)sentences.push('farmácias como '+groups.Farmácias.map(phrase).join(' e'));
  if(groups.Comércio?.length)sentences.push('opções de comércio como '+groups.Comércio.map(phrase).join(' e'));
  if(groups.Lazer?.length)sentences.push('áreas de lazer como '+groups.Lazer.map(phrase).join(' e'));
  if(groups.Alimentação?.length)sentences.push('restaurantes como '+groups.Alimentação.map(phrase).join(' e'));
  if(!sentences.length)return '';
  const intro='A localização oferece praticidade para o dia a dia, com '+formatList(sentences)+'.';
  return intro+(neighborhood||city?' '+(neighborhood?'No bairro '+neighborhood+(city?', em '+city:'')+'.':city? 'Em '+city+'.':''):'');
}

function formatDistance(m){
  if(m<1000)return Math.round(m/10)*10+' m';
  return (m/1000).toFixed(1).replace('.',',')+' km';
}

function distanceMeters(lat1,lon1,lat2,lon2){
  const r=6371000,toRad=x=>x*Math.PI/180;
  const dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*r*Math.asin(Math.sqrt(a));
}

function formatList(items){
  const clean=items.filter(Boolean);
  if(clean.length===0)return '';
  if(clean.length===1)return clean[0];
  if(clean.length===2)return clean[0]+' e '+clean[1];
  return clean.slice(0,-1).join(', ')+ ' e '+clean[clean.length-1];
}
