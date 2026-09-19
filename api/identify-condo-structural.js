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

    const query=encodeURIComponent('"' + address + ' ' + number + '" condomínio');
    let html="";
    try{
      const response=await fetch("https://www.bing.com/search?q="+query,{
        headers:{
          "User-Agent":"Mozilla/5.0",
          "Accept-Language":"pt-BR,pt;q=0.9"
        }
      });
      if(response.ok){
        html=await response.text();
      }
    }catch(e){
      html="";
    }

    const candidates=[];
    let pos=0;

    while(candidates.length<5){
      const h2=html.indexOf("<h2",pos);
      if(h2<0) break;
      const openEnd=html.indexOf(">",h2);
      const close=html.indexOf("</h2>",openEnd);
      if(openEnd<0||close<0) break;

      const section=html.slice(openEnd+1,close);
      const aStart=section.indexOf("<a");
      const aOpenEnd=section.indexOf(">",aStart);
      const aClose=section.indexOf("</a>",aOpenEnd);

      if(aStart>=0&&aOpenEnd>=0&&aClose>=0){
        const title=section.slice(aOpenEnd+1,aClose)
          .replace(/<[^>]*>/g," ")
          .trim();

        if(title.length>=5 &&
           title.toLowerCase().indexOf("pesquisar")<0 &&
           title.toLowerCase().indexOf("search")<0 &&
           title.toLowerCase().indexOf("bing")<0){
          candidates.push({
            name:title,
            source:"Bing",
            evidence_hits:1
          });
        }
      }

      pos=close+5;
    }

    return send({
      condominium_name:candidates[0]?candidates[0].name:null,
      condominium_builder:null,
      condominium_delivery_year:null,
      condominium_units:null,
      condominium_land_area:null,
      towers:null,
      floors:null,
      candidates:candidates,
      searched_address:searched,
      evidence:candidates.length
        ?"Resultados externos recebidos do Bing."
        :"Nenhum resultado externo utilizável encontrado.",
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