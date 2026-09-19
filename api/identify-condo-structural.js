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

    const normalize=function(v){
      return String(v||"")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g,"")
        .toLowerCase()
        .replace(/[^a-z0-9]/g,"");
    };

    const searched=[address,number,neighborhood,city,state,cep].filter(Boolean).join(", ");

    return send({
      condominium_name:null,
      condominium_builder:null,
      condominium_delivery_year:null,
      condominium_units:null,
      condominium_land_area:null,
      towers:null,
      floors:null,
      candidates:[],
      searched_address:searched,
      evidence:"API estrutural funcionando. Busca externa será adicionada na próxima etapa.",
      from_database:false,
      saved_to_database:false
    });
  }catch(error){
    return send({
      error:"Erro interno na identificação do condomínio.",
      message:String(error&&error.message||error),
      candidates:[],
      sources:[]
    },500);
  }
}