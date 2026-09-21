export default async function handler(req,res){
  res.setHeader("Content-Type","application/json; charset=utf-8");
  if(req.method!=="POST") return res.status(405).json({error:"Método não permitido"});
  try{
    const b=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
    const name=String(b.name||"").trim(), address=String(b.address||"").trim(), number=String(b.number||"").trim();
    if(!name||!address||!number)return res.status(400).json({error:"Nome, endereço e número são obrigatórios."});
    const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
    const base=String(process.env.SUPABASE_URL||"").replace(/\/$/,""),key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY||"");
    if(!base||!key)return res.status(500).json({error:"Supabase não configurado."});
    const h={apikey:key,Authorization:"Bearer "+key,Accept:"application/json","Content-Type":"application/json"};
    const condo={
      normalized_name:norm(name),name,cnpj:b.cnpj||null,address,number,complement:b.complement||null,
      neighborhood:b.neighborhood||null,city:b.city||"São Paulo",state:b.state||"SP",cep:b.cep||null,
      features:Array.isArray(b.features)?b.features:[],construction_year:Number.isInteger(Number(b.construction_year))?Number(b.construction_year):null,
      delivery_year:Number.isInteger(Number(b.delivery_year))?Number(b.delivery_year):null,units:Number.isInteger(Number(b.units))?Number(b.units):null,
      towers:Number.isInteger(Number(b.towers))?Number(b.towers):null,floors:Number.isInteger(Number(b.floors))?Number(b.floors):null,
      builder:b.builder||null,source_urls:Array.isArray(b.sources)?b.sources:[],evidence:b.evidence||null,confidence:b.confidence||"manual",
      last_enriched_at:new Date().toISOString(),updated_at:new Date().toISOString()
    };
    const u=await fetch(base+"/rest/v1/condominiums?on_conflict=normalized_name",{method:"POST",headers:{...h,Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify(condo)});
    const ut=await u.text();let rows=[];try{rows=JSON.parse(ut)}catch(_){}
    if(!u.ok)return res.status(502).json({error:"Falha ao salvar condomínio.",message:ut.slice(0,800)});
    const id=Array.isArray(rows)&&rows[0]?.id?rows[0].id:null;
    const cleanAddress=norm(address),city=norm(b.city||"São Paulo"),state=norm(b.state||"SP");
    const addressKey=cleanAddress+"|"+String(number).trim()+"|"+city+"|"+state;
    const mp={address_key:addressKey,address,number,neighborhood:b.neighborhood||null,city:b.city||"São Paulo",state:b.state||"SP",cep:b.cep||null,condominium_name:name,condominium_id:id,source:b.source||"confirmação manual",updated_at:new Date().toISOString()};
    const m=await fetch(base+"/rest/v1/condominium_address_map?on_conflict=address_key",{method:"POST",headers:{...h,Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify(mp)});
    const mt=await m.text();
    if(!m.ok)return res.status(502).json({error:"Condomínio salvo, mas o endereço não foi vinculado.",message:mt.slice(0,800),condominium_id:id});
    return res.status(200).json({ok:true,condominium_id:id,address_key:addressKey,condominium_name:name,features:condo.features});
  }catch(e){return res.status(500).json({error:"Erro interno.",message:String(e?.message||e)});}
}
