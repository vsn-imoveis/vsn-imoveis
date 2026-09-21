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

    let p1='Excelente '+type;
    if(neighborhood) p1+=' no bairro '+neighborhood;
    p1+=', '+purposeText+'.';

    const specs=[];
    if(area) specs.push('com '+area+' m² de área útil');
    if(bedrooms) specs.push(bedrooms+' '+(bedrooms===1?'dormitório':'dormitórios'));
    if(suites) specs.push(suites+' '+(suites===1?'suíte':'suítes'));
    if(parking) specs.push(parking+' '+(parking===1?'vaga de garagem':'vagas de garagem'));
    const p2=specs.length?'O imóvel possui '+specs.join(', ')+'.':'';

    const parts=[];
    if(condo) parts.push('O imóvel está localizado no '+condo+'.');
    if(features.length) parts.push('Entre os diferenciais informados estão '+features.join(', ').toLowerCase()+'.');
    if(condoFeatures.length) parts.push('O condomínio conta com '+condoFeatures.join(', ').toLowerCase()+'.');
    const p3=parts.join(' ');

    let p4='';
    if(address){
      p4='Localização: '+address+(neighborhood?', '+neighborhood:'')+(city?', '+city:'')+'.';
    }

    const description=[p1,p2,p3,p4].filter(Boolean).join('\n\n').trim();
    return res.status(200).json({description});
  }catch(e){
    return res.status(500).json({error:e.message||'Erro interno'});
  }
}
