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
      ? article+' '+noun+' conta com '+details.join(', ')+', oferecendo uma configuração que atende diferentes necessidades de moradia.'
      : article+' '+noun+' apresenta uma oportunidade para quem busca um imóvel no bairro'+(neighborhood?' '+neighborhood:'')+'.';

    const featureNames=features.map(x=>x.toLowerCase());
    let p3='';
    if(featureNames.length){
      p3='Entre os diferenciais informados estão '+formatList(featureNames)+'.';
    }
    if(condo){
      const condoSentence='O imóvel está localizado no '+condo+'.';
      p3=p3?(p3+' '+condoSentence):condoSentence;
    }

    let p4='';
    if(condoFeatures.length){
      p4='A estrutura informada do condomínio inclui '+formatList(condoFeatures.map(x=>x.toLowerCase()))+'.';
    }

    let p5='';
    if(address){
      p5='Localização: '+address+(neighborhood?', '+neighborhood:'')+(city?', '+city:'')+'.';
    }else if(neighborhood||city){
      p5='Localizado'+(isHouse?'a':'')+(neighborhood?' no bairro '+neighborhood:'')+(city?(neighborhood?', em ':' em ')+city:'')+'.';
    }

    const description=[intro,p2,p3,p4,p5].filter(Boolean).join('\n\n').trim();
    return res.status(200).json({description});
  }catch(e){
    return res.status(500).json({error:e.message||'Erro interno'});
  }
}

function formatList(items){
  const clean=items.filter(Boolean);
  if(clean.length===0)return '';
  if(clean.length===1)return clean[0];
  if(clean.length===2)return clean[0]+' e '+clean[1];
  return clean.slice(0,-1).join(', ')+ ' e '+clean[clean.length-1];
}
