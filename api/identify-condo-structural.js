async function handler(req,res){
  res.setHeader("Content-Type","application/json; charset=utf-8");

  if(req.method!=="POST"){
    return res.status(405).json({error:"Método não permitido"});
  }

  try{
    const body=typeof req.body==="string"
      ? JSON.parse(req.body||"{}")
      : (req.body||{});

    const address=String(body.address||"").trim();
    const number=String(body.number||"").trim();
    const neighborhood=String(body.neighborhood||"").trim();
    const city=String(body.city||"São Paulo").trim();
    const state=String(body.state||"SP").trim();
    const cep=String(body.cep||"").trim();

    if(!address||!number){
      return res.status(400).json({error:"Informe endereço e número."});
    }

    const normalize=(v)=>String(v||"")
      .normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g,"")
      .toLowerCase()
      .replace(/[^a-z0-9]/g,"");

    const searched=[address,number,neighborhood,city,state,cep]
      .filter(Boolean).join(", ");

    const addressKey=[address,number,city,state]
      .map(normalize)
      .filter(Boolean)
      .join("|");

    const supabaseUrl=String(process.env.SUPABASE_URL||"").replace(/\\/$/,"");
    const supabaseKey=String(
      process.env.SUPABASE_SERVICE_ROLE_KEY||
      process.env.SUPABASE_SECRET_KEY||
      ""
    );

    if(!supabaseUrl||!supabaseKey){
      return res.status(200).json({
        condominium_name:null,
        candidates:[],
        searched_address:searched,
        address_key:addressKey,
        from_database:false,
        saved_to_database:false,
        database_configured:false,
        evidence:"Supabase não configurado nas variáveis de ambiente da Vercel."
      });
    }

    const url=supabaseUrl+
      "/rest/v1/condominium_address_map?address_key=eq."+
      encodeURIComponent(addressKey)+
      "&select=*";

    const response=await fetch(url,{
      method:"GET",
      headers:{
        apikey:supabaseKey,
        Authorization:"Bearer "+supabaseKey,
        Accept:"application/json"
      }
    });

    const raw=await response.text();

    if(!response.ok){
      return res.status(200).json({
        condominium_name:null,
        candidates:[],
        searched_address:searched,
        address_key:addressKey,
        from_database:false,
        saved_to_database:false,
        database_configured:true,
        database_http_status:response.status,
        evidence:"Supabase respondeu com erro.",
        database_message:raw.slice(0,500)
      });
    }

    let rows=[];
    try{
      rows=JSON.parse(raw);
    }catch(e){
      rows=[];
    }

    if(Array.isArray(rows)&&rows.length>0){
      const row=rows[0];

      return res.status(200).json({
        condominium_name:row.condominium_name||null,
        condominium_builder:null,
        condominium_delivery_year:null,
        condominium_units:null,
        condominium_land_area:null,
        towers:null,
        floors:null,
        candidates:[{
          name:row.condominium_name||"",
          source:row.source||"Banco próprio",
          evidence_hits:1,
          context:row.address||searched
        }],
        searched_address:searched,
        address_key:addressKey,
        evidence:"Condomínio encontrado no banco próprio por endereço exato.",
        from_database:true,
        saved_to_database:false,
        database_configured:true
      });
    }

    return res.status(200).json({
      condominium_name:null,
      condominium_builder:null,
      condominium_delivery_year:null,
      condominium_units:null,
      condominium_land_area:null,
      towers:null,
      floors:null,
      candidates:[],
      searched_address:searched,
      address_key:addressKey,
      evidence:"Nenhum condomínio encontrado no banco próprio para este endereço.",
      from_database:false,
      saved_to_database:false,
      database_configured:true
    });

  }catch(error){
    return res.status(500).json({
      error:"Erro interno na identificação do condomínio.",
      message:String(error&&error.message||error),
      candidates:[]
    });
  }
}


module.exports = handler;
