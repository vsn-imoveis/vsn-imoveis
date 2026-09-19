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
    const addressNeedle=normalize(address);
    const numberNeedle=normalize(number);
    let pos=0;

    while(candidates.length<5){
      const h2=html.indexOf("<h2",pos);
      if(h2<0) break;

      const liStart=html.lastIndexOf("<li",h2);
      const liEnd=html.indexOf("</li>",h2);
      const h2OpenEnd=html.indexOf(">",h2);
      const h2Close=html.indexOf("</h2>",h2OpenEnd);

      if(liStart<0||liEnd<0||h2OpenEnd<0||h2Close<0){
        pos=h2+3;
        continue;
      }

      const resultBlock=html.slice(liStart,liEnd+5);
      const resultText=resultBlock.replace(/<[^>]*>/g," ");

      // O resultado só pode ser candidato se o próprio resultado
      // mencionar o endereço e o número pesquisados.
      const normalizedResult=normalize(resultText);
      if(!normalizedResult.includes(addressNeedle)||!normalizedResult.includes(numberNeedle)){
        pos=liEnd+5;
        continue;
      }

      const section=html.slice(h2OpenEnd+1,h2Close);
      const aStart=section.indexOf("<a");
      const aOpenEnd=section.indexOf(">",aStart);
      const aClose=section.indexOf("</a>",aOpenEnd);

      if(aStart>=0&&aOpenEnd>=0&&aClose>=0){
        const title=section.slice(aOpenEnd+1,aClose).replace(/<[^>]*>/g," ").trim();
        const lower=title.toLowerCase();

        if(title.length>=5 &&
           lower.indexOf("pesquisar")<0 &&
           lower.indexOf("search")<0 &&
           lower.indexOf("bing")<0 &&
           lower.indexOf("hotel")<0 &&
           lower.indexOf("tripadvisor")<0 &&
           lower.indexOf("booking.com")<0 &&
           lower.indexOf("kayak")<0){
          candidates.push({
            name:title,
            source:"Bing",
            evidence_hits:1,
            context:resultText.replace(/\\s+/g," ").trim().slice(0,1000)
          });
        }
      }

      pos=liEnd+5;
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