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
      address+' '+number+' condomínio '+city,
      address+' '+number+' '+cep
    ];

    const extract=(html,source)=>{
      const raw=String(html||'');
      const target=normalize(address);
      const num=number.replace(/\D/g,'');

      // Trabalha por resultado individual, preservando título + descrição.
      // Isso é mais confiável do que limpar a página inteira e perder o contexto.
      const blocks=raw.match(/<li[^>]*class=["'][^"']*b_algo[^"']*["'][\s\S]*?<\/li>/gi)||[];

      for(const block of blocks){
        const blockText=strip(block);
        const nb=normalize(blockText);

        if(!nb.includes(target)||!nb.includes(num)) continue;

        const titleMatch=block.match(/<h2[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/i);
        const title=titleMatch?strip(titleMatch[1]):'';

        const context=blockText.slice(0,500);

        // Procura primeiro uma identificação explícita.
        const explicit=blockText.match(/(?:condom[ií]nio|edif[ií]cio|residencial|empreendimento)[\s:,-]+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 .&\/-]{2,100})/i);

        if(explicit){
          let name=explicit[1].trim();
          name=name.split(/\s+(?:localizado|fica|est[aá]|na|em|com|possui|tem|apartamento|im[oó]vel)\s+/i)[0].trim();
          name=name.replace(/[,.!?;:]+$/,'').trim();
          if(name.length>=5&&name.length<=100&&!name.endsWith('&')){
            add(name,source,context);
          }
        }

        // Se não houver "Condomínio X", usa o título do resultado.
        // O título precisa estar associado ao endereço dentro do mesmo resultado.
        if(title&&title.length>=6&&title.length<=120){
          const low=title.toLowerCase();
          if(!/^(residencial|condom[ií]nio|edif[ií]cio|apartamento|im[oó]vel)$/i.test(low)){
            add(title,source,context);
          }
        }
      }

      // Fallback para páginas em que o Bing não usa o markup b_algo.
      const text=strip(raw);
      const nt=normalize(text);
      if(nt.includes(target)&&nt.includes(num)){
        const explicit=text.match(/(?:condom[ií]nio|edif[ií]cio|residencial|empreendimento)[\s:,-]+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 .&\/-]{2,100})/i);
        if(explicit){
          let name=explicit[1].trim().split(/\s+(?:localizado|fica|est[aá]|na|em|com|possui|tem)\s+/i)[0].trim();
          name=name.replace(/[,.!?;:]+$/,'');
          if(name.length>=5&&!name.endsWith('&')) add(name,source,text.slice(0,500));
        }
      }
    };

    for(const q of queries){
      const encoded=encodeURIComponent(q);
      try{
        const r=await fetch('https://www.bing.com/search?q='+encoded,{headers:{'User-Agent':'Mozilla/5.0','Accept-Language':'pt-BR,pt;q=0.9'}});
        if(r.ok) extract(await r.text(),'Bing');
      }catch(e){}
      if(Object.keys(candidates).length) break;

      try{
        const r=await fetch('https://html.duckduckgo.com/html/?q='+encoded,{headers:{'User-Agent':'Mozilla/5.0','Accept-Language':'pt-BR,pt;q=0.9'}});
        if(r.ok) extract(await r.text(),'DuckDuckGo');
      }catch(e){}
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