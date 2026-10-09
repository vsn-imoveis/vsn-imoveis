async function handler(req,res){
  res.setHeader("Content-Type","application/json; charset=utf-8");
  if(req.method!=="POST") return res.status(405).json({error:"Método não permitido"});
  try{
    const b=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
    const address=String(b.address||"").trim(), number=String(b.number||"").trim();
    const neighborhood=String(b.neighborhood||"").trim(), city=String(b.city||"São Paulo").trim();
    const state=String(b.state||"SP").trim(), cep=String(b.cep||"").trim();
    if(!address||!number) return res.status(400).json({error:"Informe endereço e número."});
    const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
    const searched=[address,number,neighborhood,city,state,cep].filter(Boolean).join(", ");
    const addressKey=[address,number,city,state].map(norm).filter(Boolean).join("|");
    const base=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
    const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY||"");
    if(base&&key){
      const h={apikey:key,Authorization:"Bearer "+key,Accept:"application/json","Content-Type":"application/json"};
      const api=async(path)=>{const r=await fetch(base+path,{headers:h});const t=await r.text();let j=[];try{j=JSON.parse(t)}catch(_){}return {r,j,t}};
      const map=await api("/rest/v1/condominium_address_map?address_key=eq."+encodeURIComponent(addressKey)+"&select=*");
      if(map.r.ok&&Array.isArray(map.j)&&map.j.length){
        const row=map.j[0];let condo=null;
        if(row.condominium_id){const q=await api("/rest/v1/condominiums?id=eq."+encodeURIComponent(row.condominium_id)+"&select=*");if(q.r.ok&&q.j[0])condo=q.j[0];}
        if(!condo&&row.condominium_name){const q=await api("/rest/v1/condominiums?normalized_name=eq."+encodeURIComponent(norm(row.condominium_name))+"&select=*");if(q.r.ok&&q.j[0])condo=q.j[0];}
        return res.status(200).json({condominium_name:row.condominium_name||condo?.name||null,condominium_id:condo?.id||row.condominium_id||null,features:condo?.features||[],condominium_builder:condo?.builder||null,condominium_delivery_year:condo?.delivery_year||null,condominium_construction_year:condo?.construction_year||null,condominium_units:condo?.units||null,towers:condo?.towers||null,floors:condo?.floors||null,sources:condo?.source_urls||[],confidence:condo?.confidence||null,evidence:condo?.evidence||"Condomínio encontrado no banco próprio por endereço exato.",candidates:[{name:row.condominium_name||condo?.name||"",source:row.source||"Banco próprio",evidence_hits:1,context:row.address||searched}],searched_address:searched,address_key:addressKey,from_database:true,saved_to_database:false,database_configured:true});
      }
    }
    const origin=new URL(req.url).origin;
    const rr=await fetch(origin+"/api/identify-condo-fixed.js",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({address,number,neighborhood,city,state,cep}),signal:AbortSignal.timeout(28000)});
    const data=await rr.json().catch(()=>({}));
    const name=String(data.condominium_name||"").trim();
    if(!name) return res.status(200).json({...data,searched_address:searched,address_key:addressKey,from_database:false,saved_to_database:false,database_configured:true});
    return res.status(200).json({...data,searched_address:searched,address_key:addressKey,from_database:false,saved_to_database:false,database_configured:!!(base&&key)});
  }catch(e){return res.status(500).json({error:"Erro interno na identificação do condomínio.",message:String(e?.message||e),candidates:[]});}
}
module.exports=handler;
