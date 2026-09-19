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

    const normalize=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
    const addressKey=normalize(address)+"|"+number.trim()+"|"+normalize(city)+"|"+normalize(state);

    // Primeiro: consulta a base interna. Não fazemos pesquisa externa se já conhecemos o endereço.
    const supabaseUrl=process.env.SUPABASE_URL||"https://jpdfynaioepcmgqlqlht.supabase.co";
    const supabaseKey=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_ANON_KEY||"";
    if(supabaseKey){
      const r0=await fetch(supabaseUrl+"/rest/v1/condominium_address_map?address_key=eq."+encodeURIComponent(addressKey)+"&select=*",{
        headers:{apikey:supabaseKey,Authorization:"Bearer "+supabaseKey}
      });
      if(r0.ok){
        const rows=await r0.json();
        if(rows[0]?.condominium_name){
          return send({
            condominium_name:rows[0].condominium_name,
            condominium_builder:null,condominium_delivery_year:null,
            condominium_units:null,condominium_land_area:null,towers:null,floors:null,
            candidates:[{name:rows[0].condominium_name,source:"Base interna VSN",evidence_hits:3}],
            sources:[],searched_address:[address,number,neighborhood,city,state,cep].filter(Boolean).join(", "),
            evidence:"Endereço encontrado na base interna VSN.",from_database:true
          });
        }
      }
    }

    const searched=[address,number,neighborhood,city,state,cep].filter(Boolean).join(", ");
    const candidates={};
    const clean=v=>String(v||"").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/\\s+/g," ").trim();
    const add=(name,source,context,url)=>{
      let n=clean(name).replace(/^[\s,;:.|\-]+|[\s,;:.|\-]+$/g,"");
      n=n.replace(/^(condom[ií]nio|edif[ií]cio|residencial)\s*[-:–—]?\s*/i,"").trim();
      if(n.length<5||n.length>120)return;
      if(/^(resultados?|pesquisa|search|bing|google|duckduckgo|apartamentos?)$/i.test(n))return;
      if(/^(rua|avenida|estrada)\s+/i.test(n))return;
      const key=normalize(n);
      if(!candidates[key])candidates[key]={name:n,source,context:clean(context).slice(0,1200),url:url||"",hits:0};
      candidates[key].hits++;
    };

    const strip=html=>clean(String(html||""));
    const fetchText=async url=>{
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),5000);
      try{
        const r=await fetch(url,{signal:controller.signal,headers:{
          "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36",
          "Accept-Language":"pt-BR,pt;q=0.9"
        }});
        if(!r.ok)return "";
        return await r.text();
      }catch(_){return ""}finally{clearTimeout(timer)}
    };

    const extract= (html,source)=>{
      const raw=String(html||"");
      const text=strip(raw);
      const addrNorm=normalize(address);
      const numNorm=normalize(number);
      const relevant=normalize(text).includes(addrNorm)||(
        normalize(text).includes(numNorm)&&normalize(text).includes(normalize(address.split(/\s+/).slice(-1)[0]||address))
      );
      if(!relevant)return;

      const titleRe=/<h2[^>]*>[\s\S]*?<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/gi;
      let m;
      while((m=titleRe.exec(raw))){
        const title=strip(m[2]);\n        const snippet=strip(m[3]);
        if(!title)continue;
        const context=strip(raw.slice(Math.max(0,m.index),Math.min(raw.length,titleRe.lastIndex)));\n        const evidenceText=strip(title+" "+snippet+" "+context);
        if(!normalize(evidenceText).includes(addrNorm))continue;
        const explicit=title.match(/(?:condom[ií]nio|edif[ií]cio|residencial|residence|empreendimento)[\s:,-]+(.+)/i);
        if(explicit)add(explicit[1],source,evidenceText,m[1]);
        else if(/misti|morumbi|residence|residencial|condom[ií]nio|edif[ií]cio/i.test(title))add(title,source,evidenceText,m[1]);
      }

      const patterns=[
        /(?:condom[ií]nio|edif[ií]cio|residencial|residence|empreendimento)[\s:,-]+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 .&'\/-]{3,100})/i
      ];
      for(const p of patterns){
        const hit=text.match(p);
        if(hit){
          let name=hit[1].split(/\s+(?:localizado|fica|est[aá]|na|no|em|com|possui|tem|apartamento|im[oó]vel|rua|bairro|cep|s[aã]o paulo)\s+/i)[0];
          add(name,source,text,"");
        }
      }
    };

    const queries=[
      '"'+searched+'" condomínio',
      '"'+address+' '+number+'" residencial',
      '"'+address+' '+number+'" edifício'
    ];

    for(const q of queries){
      const enc=encodeURIComponent(q);
      const bing=await fetchText("https://www.bing.com/search?q="+enc);
      if(bing)extract(bing,"Bing");
      if(Object.keys(candidates).length>=3)break;
      const ddg=await fetchText("https://html.duckduckgo.com/html/?q="+enc);
      if(ddg)extract(ddg,"DuckDuckGo");
      if(Object.keys(candidates).length>=3)break;
    }

    const list=Object.values(candidates).sort((a,b)=>b.hits-a.hits).slice(0,8);
    const best=list[0]||null;

    // Salva automaticamente somente o resultado externo bruto/candidato principal.
    // O tratamento/confirmacao continua separado para não contaminar a base com falso positivo.
    if(best&&supabaseKey){
      await fetch(supabaseUrl+"/rest/v1/condominium_address_map?on_conflict=address_key",{
        method:"POST",
        headers:{
          apikey:supabaseKey,Authorization:"Bearer "+supabaseKey,
          "Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=minimal"
        },
        body:JSON.stringify({
          address_key:addressKey,address,number,neighborhood:neighborhood||null,
          city,state,cep:cep||null,condominium_name:best.name,
          source:"Pesquisa externa — "+best.source
        })
      }).catch(()=>{});
    }

    return send({
      condominium_name:best?.name||null,
      condominium_builder:null,condominium_delivery_year:null,
      condominium_units:null,condominium_land_area:null,towers:null,floors:null,
      candidates:list.map(x=>({name:x.name,source:x.source,evidence_hits:x.hits,context:x.context,url:x.url||null})),
      searched_address:searched,
      evidence:best?"Candidato encontrado em fontes públicas externas.":"Nenhum candidato confiável encontrado nas fontes externas.",
      from_database:false,
      saved_to_database:!!best&&!!supabaseKey
    });
  }catch(error){
    return send({error:"Erro interno na identificação do condomínio.",message:String(error?.message||error),candidates:[],sources:[]},500);
  }
}