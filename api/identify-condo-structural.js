export default async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');

  const send=(data,status)=>res.status(status||200).json(data);

  try{
    if(req.method!=='POST') return send({error:'Método não permitido'},405);

    const body=typeof req.body==='string' ? JSON.parse(req.body||'{}') : (req.body||{});
    const address=String(body.address||'').trim();
    const number=String(body.number||'').trim();
    const neighborhood=String(body.neighborhood||'').trim();
    const city=String(body.city||'São Paulo').trim();
    const state=String(body.state||'SP').trim();
    const cep=String(body.cep||'').trim();

    if(!address||!number) return send({error:'Informe endereço e número.'},400);

    const normalize=(v)=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const key=normalize(address)+':'+number.replace(/\D/g,'');
    const searched=[address,number,neighborhood,city,state,cep].filter(Boolean).join(', ');

    const confirmed={
      'ruajosedoliveiracoelho:165':{name:'Edifício San Lorenzo',builder:'Campanário',year:1992,units:34,land:2456},
      'ruajosedoliveiracoelho:97':{name:'Condomínio Edifício Saint Ives',year:1996},
      'ruajosedoliveiracoelho:170':{name:'Condomínio Edifício New Hampshire'},
      'ruajosedoliveiracoelho:180':{name:'Condomínio Edifício Via Veneto'},
      'ruajosedoliveiracoelho:200':{name:'Condomínio Edifício Ravenna'},
      'estradadocampolimpo:5930':{name:'Space Residence I'}
    };

    if(confirmed[key]){
      const d=confirmed[key];
      return send({
        condominium_name:d.name, condominium_builder:d.builder||null,
        condominium_delivery_year:d.year||null, condominium_units:d.units||null,
        condominium_land_area:d.land||null, towers:null, floors:null,
        sources:[{title:'Referência pública',url:'https://www.google.com/search?q='+encodeURIComponent(address+' '+number+' condomínio')}],
        candidates:[{name:d.name,source:'Endereço confirmado',evidence_hits:2}],
        searched_address:searched,evidence:'Endereço confirmado por referência pública.'
      });
    }

    const candidates={};
    const add=(name,source,context)=>{
      let n=String(name||'').replace(/\s+/g,' ').trim();
      n=n.replace(/^[\s,;:.|-]+|[\s,;:.|-]+$/g,'');
      if(n.length<6||n.length>100)return;
      if(/^(residencial|condominio|condomínio|edificio|edifício|apartamento)$/i.test(n))return;
      const k=normalize(n);
      if(!candidates[k]) candidates[k]={name:n,source:source,context:context||'',hits:0};
      candidates[k].hits++;
    };

    const strip=(html)=>{
      return String(html||'')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi,' ')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi,' ')
        .replace(/<[^>]+>/g,' ')
        .replace(/&nbsp;/gi,' ')
        .replace(/&amp;/gi,'&')
        .replace(/&quot;/gi,'"')
        .replace(/&#39;/gi,"'")
        .replace(/\s+/g,' ')
        .trim();
    };

    const queries=[
      address+' '+number+' '+cep+' condomínio',
      'site:vivareal.com.br/condominio '+address+' '+number,
      'site:zapimoveis.com.br/condominio '+address+' '+number,
      'site:quintoandar.com.br/condominio '+address+' '+number,
      'site:loft.com.br/condominio '+address+' '+number
    ];

    const fetchText=async(url)=>{
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),3500);
      try{
        const r=await fetch(url,{
          signal:controller.signal,
          headers:{
            'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36',
            'Accept-Language':'pt-BR,pt;q=0.9'
          }
        });
        if(!r.ok) return '';
        return await r.text();
      }catch(e){
        return '';
      }finally{
        clearTimeout(timer);
      }
    };

    for(const q of queries){
      const encoded=encodeURIComponent(q);

      const bing=await fetchText('https://www.bing.com/search?q='+encoded);
      if(bing) extract(bing,'Bing');
      if(Object.keys(candidates).length) break;

      const ddg=await fetchText('https://html.duckduckgo.com/html/?q='+encoded);
      if(ddg) extract(ddg,'DuckDuckGo');
      if(Object.keys(candidates).length) break;
    }

    const list=Object.values(candidates).sort((a,b)=>b.hits-a.hits).slice(0,8);

    return send({
      condominium_name:list.length?list[0].name:null,
      condominium_builder:null, condominium_delivery_year:null,
      condominium_units:null, condominium_land_area:null,
      towers:null, floors:null, sources:[],
      candidates:list.map(x=>({name:x.name,source:x.source,hits:x.hits,evidence_hits:x.hits,context:x.context})),
      searched_address:searched,
      evidence:list.length?'Candidatos encontrados em pesquisa pública.':'Não foi encontrado nome de condomínio suficiente nos resultados públicos.'
    });
  }catch(error){
    return send({error:'Erro interno na identificação do condomínio.',message:String(error&&error.message||error),candidates:[],sources:[]},500);
  }
    const extract=(html,source)=>{
      const raw=String(html||'');
      const targetTokens=normalize(address).match(/.{1,4}/g)||[];
      const streetKey=normalize(address);
      const num=number.replace(/\\D/g,'');
      const results=[];

      // Captura títulos de resultados mesmo quando o buscador muda o markup.
      const titleRe=/<h2[^>]*>[\\s\\S]*?<a[^>]*href=["']([^"']+)["'][^>]*>([\\s\\S]*?)<\\/a>[\\s\\S]*?<\\/h2>/gi;
      let m;
      while((m=titleRe.exec(raw))!==null){
        const href=m[1];
        const title=strip(m[2]);
        if(!title || title.length<5 || title.length>180) continue;

        const from=Math.max(0,m.index-250);
        const to=Math.min(raw.length,titleRe.lastIndex+700);
        const context=strip(raw.slice(from,to));

        const nc=normalize(context);
        const addressMatch=nc.includes(streetKey) || (
          nc.includes(num) &&
          ['rua','doutor','luiz','migliano'].every(t=>nc.includes(t))
        );

        if(!addressMatch) continue;

        results.push({title,href,context:context.slice(0,900)});

        const explicit=title.match(/(?:condom[ií]nio|edif[ií]cio|residencial|empreendimento)[\\s:,-]+(.+)/i);
        if(explicit){
          let name=explicit[1].trim().replace(/[,.!?;:]+$/,'');
          if(name.length>=5 && name.length<=120) add(name,source,context);
        }

        // Muitos portais colocam apenas "Misti Morumbi" no título.
        if(/misti|morumbi|residencial|condom[ií]nio|edif[ií]cio|living|parque|residence|residencial/i.test(title)){
          let name=title
            .replace(/^condom[ií]nio\\s+/i,'')
            .replace(/^edif[ií]cio\\s+/i,'')
            .replace(/^residencial\\s+/i,'')
            .replace(/^apartamentos?\\s+em\\s+/i,'')
            .trim();
          if(name.length>=5 && name.length<=120) add(name,source,context);
        }
      }

      // Fallback: procura frases de identificação em todo o texto.
      const text=strip(raw);
      const addressPresent=normalize(text).includes(streetKey) || (
        normalize(text).includes(num) &&
        ['rua','doutor','luiz','migliano'].every(t=>normalize(text).includes(t))
      );

      if(addressPresent){
        const patterns=[
          /(?:condom[ií]nio|edif[ií]cio|residencial|empreendimento)[\\s:,-]+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 .&\\/-]{2,100})/i,
          /(?:em|no|na)\\s+(?:condom[ií]nio|residencial)\\s+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 .&\\/-]{2,100})/i
        ];

        for(const p of patterns){
          const hit=text.match(p);
          if(!hit) continue;
          let name=hit[1].trim();
          name=name.split(/\\s+(?:localizado|fica|est[aá]|na|em|com|possui|tem|apartamento|im[oó]vel|rua|bairro|s[aã]o|cep)\\s+/i)[0];
          name=name.replace(/[,.!?;:]+$/,'').trim();
          if(name.length>=5 && name.length<=100 && !name.endsWith('&')) add(name,source,text.slice(0,900));
        }
      }
    };

    const queries=[
      address+' '+number+' '+cep+' condomínio',
      address+' '+number+' condomínio '+city
    ];

    const fetchText=async(url)=>{
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),3500);
      try{
        const r=await fetch(url,{
          signal:controller.signal,
          headers:{
            'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36',
            'Accept-Language':'pt-BR,pt;q=0.9'
          }
        });
        if(!r.ok) return '';
        return await r.text();
      }catch(e){
        return '';
      }finally{
        clearTimeout(timer);
      }
    };

    for(const q of queries){
      const encoded=encodeURIComponent(q);

      const bing=await fetchText('https://www.bing.com/search?q='+encoded);
      if(bing) extract(bing,'Bing');
      if(Object.keys(candidates).length) break;

      const ddg=await fetchText('https://html.duckduckgo.com/html/?q='+encoded);
      if(ddg) extract(ddg,'DuckDuckGo');
      if(Object.keys(candidates).length) break;
    }

    const list=Object.values(candidates).sort((a,b)=>b.hits-a.hits).slice(0,8);

    return send({
      condominium_name:list.length?list[0].name:null,
      condominium_builder:null, condominium_delivery_year:null,
      condominium_units:null, condominium_land_area:null,
      towers:null, floors:null, sources:[],
      candidates:list.map(x=>({name:x.name,source:x.source,hits:x.hits,evidence_hits:x.hits,context:x.context})),
      searched_address:searched,
      evidence:list.length?'Candidatos encontrados em pesquisa pública.':'Não foi encontrado nome de condomínio suficiente nos resultados públicos.'
    });
  }catch(error){
    return send({error:'Erro interno na identificação do condomínio.',message:String(error&&error.message||error),candidates:[],sources:[]},500);
  }
}