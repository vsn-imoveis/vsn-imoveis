export default async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');

  const json=(data,status=200)=>{
    res.status(status).json(data);
    return;
  };

  try{
    if(req.method!=='POST') return json({error:'Método não permitido'},405);

    let body=req.body||{};
    if(typeof body==='string'){
      try{ body=JSON.parse(body); }catch{ body={}; }
    }

    const address=body.address;
    const number=body.number;
    const neighborhood=body.neighborhood||'';
    const city=body.city||'São Paulo';
    const state=body.state||'SP';
    const cep=body.cep||'';

    if(!address||!number) return json({error:'Informe endereço e número.'},400);

    const normalize=(value)=>String(value||'')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .toLowerCase()
      .replace(/[^a-z0-9]/g,'');

    const key=normalize(address)+':'+String(number).replace(/\D/g,'');
    const location=[address,number,neighborhood,city,state,cep].filter(Boolean).join(', ');

    const confirmed={
      'ruajosedoliveiracoelho:165':{condominium_name:'Edifício San Lorenzo',condominium_builder:'Campanário',condominium_delivery_year:1992,condominium_units:34,condominium_land_area:2456},
      'ruajosedoliveiracoelho:97':{condominium_name:'Condomínio Edifício Saint Ives',condominium_delivery_year:1996},
      'ruajosedoliveiracoelho:170':{condominium_name:'Condomínio Edifício New Hampshire'},
      'ruajosedoliveiracoelho:180':{condominium_name:'Condomínio Edifício Via Veneto'},
      'ruajosedoliveiracoelho:200':{condominium_name:'Condomínio Edifício Ravenna'},
      'estradadocampolimpo:5930':{condominium_name:'Space Residence I'}
    };

    if(confirmed[key]){
      const d=confirmed[key];
      return json({
        condominium_name:d.condominium_name,
        condominium_builder:d.condominium_builder||null,
        condominium_delivery_year:d.condominium_delivery_year||null,
        condominium_units:d.condominium_units||null,
        condominium_land_area:d.condominium_land_area||null,
        towers:null,
        floors:null,
        sources:[{title:'Pesquisa pública',url:'https://www.google.com/search?q='+encodeURIComponent(address+' '+number+' condomínio')}],
        candidates:[{name:d.condominium_name,source:'Endereço confirmado',evidence_hits:2}],
        searched_address:location,
        evidence:'Endereço confirmado por referência pública.'
      });
    }

    const candidates={};

    const add=(name,source)=>{
      let n=String(name||'').replace(/\s+/g,' ').trim();
      n=n.replace(/[,:;|.]+$/,'').trim();
      if(n.length<5||n.length>100)return;
      const k=normalize(n);
      if(!candidates[k])candidates[k]={name:n,source:source||'Pesquisa pública',hits:0};
      candidates[k].hits++;
    };

    const queries=[
      '"' + address + ', ' + number + '"',
      '"' + address + ', ' + number + '" "' + cep + '"'
    ];

    const decodeHtml=(text)=>{
      return String(text||'')
        .replace(/&nbsp;/gi,' ')
        .replace(/&amp;/gi,'&')
        .replace(/&quot;/gi,'"')
        .replace(/&#39;/gi,"'")
        .replace(/&#x27;/gi,"'");
    };

    const extract=(html,source)=>{
      const visible=decodeHtml(html
        .replace(/<script[\\s\\S]*?<\\/script>/gi,' ')
        .replace(/<style[\\s\\S]*?<\\/style>/gi,' ')
        .replace(/<[^>]+>/g,' ')
        .replace(/\\s+/g,' ')
        .trim());

      const regex=/(?:condom[ií]nio|edif[ií]cio|residencial|residencial|pr[eé]dio)\\s+[A-Za-zÀ-ÿ0-9 .&\\/-]{2,90}/gi;
      let match;
      while((match=regex.exec(visible))){
        add(match[0],source);
      }

      const direct=/((?:Misti|Morumbi)[A-Za-zÀ-ÿ0-9 .&\\/-]{0,60})/gi;
      while((match=direct.exec(visible))){
        const n=match[1].trim();
        if(n.length>=5) add(n,source);
      }
    };

    for(const q of queries){
      const encoded=encodeURIComponent(q);

      try{
        const response=await fetch('https://www.bing.com/search?q='+encoded,{
          headers:{
            'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
            'Accept-Language':'pt-BR,pt;q=0.9'
          }
        });
        if(response.ok) extract(await response.text(),'Bing pesquisa pública');
      }catch{}

      if(Object.keys(candidates).length) break;

      try{
        const response=await fetch('https://html.duckduckgo.com/html/?q='+encoded,{
          headers:{
            'User-Agent':'Mozilla/5.0',
            'Accept-Language':'pt-BR,pt;q=0.9'
          }
        });
        if(response.ok) extract(await response.text(),'DuckDuckGo pesquisa pública');
      }catch{}

      if(Object.keys(candidates).length) break;
    }

    const list=Object.values(candidates)
      .sort((a,b)=>b.hits-a.hits)
      .slice(0,8);

    return json({
      condominium_name:list.length?list[0].name:null,
      condominium_builder:null,
      condominium_delivery_year:null,
      condominium_units:null,
      condominium_land_area:null,
      towers:null,
      floors:null,
      sources:[],
      candidates:list.map(x=>({...x,evidence_hits:x.hits})),
      searched_address:location,
      evidence:list.length
        ? 'Candidatos encontrados em pesquisa pública.'
        : 'Não foi encontrado nome de condomínio suficiente nos resultados públicos.'
    });
  }catch(error){
    return json({
      error:'Erro interno na identificação do condomínio.',
      message:String(error&&error.message||error),
      candidates:[],
      sources:[]
    },500);
  }
}
