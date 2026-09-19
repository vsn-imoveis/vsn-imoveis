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

    // 1) Banco próprio primeiro: endereço confirmado anteriormente tem prioridade
    // sobre qualquer busca externa. A chave secreta fica somente no backend.
    const addressKey=[address,number,city,state]
      .map(normalize)
      .filter(Boolean)
      .join("|");

    const supabaseUrl=process.env.SUPABASE_URL || "";
    const supabaseSecret=process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    let databaseMatch=null;
    let databaseError=null;

    if(supabaseUrl && supabaseSecret){
      try{
        const dbUrl=supabaseUrl.replace(/\\/$/,"")+
          "/rest/v1/condominium_address_map?address_key=eq."+encodeURIComponent(addressKey)+"&select=*";
        const dbResponse=await fetch(dbUrl,{
          headers:{
            apikey:supabaseSecret,
            Authorization:"Bearer "+supabaseSecret,
            Accept:"application/json"
          }
        });
        if(dbResponse.ok){
          const rows=await dbResponse.json();
          if(Array.isArray(rows) && rows.length) databaseMatch=rows[0];
        }else{
          databaseError="Supabase HTTP "+dbResponse.status;
        }
      }catch(e){
        databaseError=String(e&&e.message||e);
      }
    }else{
      databaseError="Variáveis SUPABASE_URL/SUPABASE_SECRET_KEY não configuradas no backend.";
    }

    if(databaseMatch){
      return send({
        condominium_name:databaseMatch.condominium_name||null,
        condominium_builder:null,
        condominium_delivery_year:null,
        condominium_units:null,
        condominium_land_area:null,
        towers:null,
        floors:null,
        candidates:[{
          name:databaseMatch.condominium_name,
          source:databaseMatch.source||"Banco próprio",
          evidence_hits:1,
          context:databaseMatch.address||searched
        }],
        searched_address:searched,
        evidence:"Condomínio encontrado no banco próprio por endereço exato.",
        from_database:true,
        saved_to_database:false,
        address_key:addressKey
      });
    }


    const queries=[
      '"' + address + ' ' + number + '" condomínio',
      '"' + address.replace(/^Rua Doutor/i,"Rua Dr.") + ' ' + number + '" residencial',
      '"' + address + ' ' + number + '" edifício'
    ];
    let html="";
    for(const q of queries){
      try{
        const response=await fetch("https://www.bing.com/search?q="+encodeURIComponent(q),{
          headers:{
            "User-Agent":"Mozilla/5.0",
            "Accept-Language":"pt-BR,pt;q=0.9"
          }
        });
        if(response.ok){
          html+=await response.text();
        }
      }catch(e){}
      if(html.length>150000) break;
    }

    const candidates=[];
    const addressNeedle=normalize(address);
    const streetWords=normalize(address).replace(/^rua/,"").slice(0,18);
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
      const hasAddress=normalizedResult.includes(addressNeedle) || (streetWords.length>=8 && normalizedResult.includes(streetWords));
      if(!hasAddress||!normalizedResult.includes(numberNeedle)){
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

    // Nenhum resultado externo é um caso normal: responde 200 com JSON válido.
    // Não tentamos acessar propriedades de um candidato inexistente nem gravar no banco nesta etapa.
    if(candidates.length===0){
      return send({
        condominium_name:null,
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
    }

    return send({
      condominium_name:candidates[0]?.name||null,
      condominium_builder:null,
      condominium_delivery_year:null,
      condominium_units:null,
      condominium_land_area:null,
      towers:null,
      floors:null,
      candidates:candidates,
      searched_address:searched,
      evidence:"Resultados externos recebidos do Bing.",
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