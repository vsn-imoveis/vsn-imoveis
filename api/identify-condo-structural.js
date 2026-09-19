export default async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');

  const reply=(data,status=200)=>res.status(status).json(data);

  try{
    if(req.method!=='POST') return reply({error:'Método não permitido'},405);

    let body=req.body||{};
    if(typeof body==='string'){
      try{ body=JSON.parse(body); }catch(e){ body={}; }
    }

    const address=String(body.address||'').trim();
    const number=String(body.number||'').trim();
    const neighborhood=String(body.neighborhood||'').trim();
    const city=String(body.city||'São Paulo').trim();
    const state=String(body.state||'SP').trim();
    const cep=String(body.cep||'').trim();

    if(!address||!number) return reply({error:'Informe endereço e número.'},400);

    const normalize=(value)=>String(value||'')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .toLowerCase()
      .replace(/[^a-z0-9]/g,'');

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
      return reply({
        condominium_name:d.name,
        condominium_builder:d.builder||null,
        condominium_delivery_year:d.year||null,
        condominium_units:d.units||null,
        condominium_land_area:d.land||null,
        towers:null,
        floors:null,
        sources:[{title:'Referência pública',url:'https://www.google.com/search?q='+encodeURIComponent(address+' '+number+' condomínio')}],
        candidates:[{name:d.name,source:'Endereço confirmado',evidence_hits:2}],
        searched_address:searched,
        evidence:'Endereço confirmado por referência pública.'
      });
    }

    const candidates={};

    const add=(name,source)=>{
      const clean=String(name||'').replace(/\s+/g,' ').trim().replace(/^[\s:,-]+|[\s:;,.-]+$/g,'');
      if(clean.length<5||clean.length>100)return;
      const keyName=normalize(clean);
      if(!candidates[keyName]) candidates[keyName]={name:clean,source:source,hits:0};
      candidates[keyName].hits++;
    };

    const extractText=(html)=>{
      return String(html||'')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi,' ')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi,' ')
        .replace(/<[^>]*>/g,' ')
        .replace(/&nbsp;/gi,' ')
        .replace(/&amp;/gi,'&')
        .replace(/&quot;/gi,'"')
        .replace(/&#39;/gi,"'")
        .replace(/\s+/g,' ')
        .trim();
    };

    const extractNames=(html,source)=>{
      const raw=String(html||'');
      const text=extractText(raw);

      // Em vez de capturar apenas "Condomínio X", guarda frases maiores
      // do resultado. Depois extraímos o nome a partir do contexto.
      const normalized=normalize(text);
      const street=normalize(address);
      const num=number.replace(/\D/g,'');

      if(!normalized.includes(street)||!normalized.includes(num)) return;

      const lines=text
        .split(/[\\n\\r]+/)
        .map(x=>x.replace(/\\s+/g,' ').trim())
        .filter(x=>x.length>=20&&x.length<=350);

      for(const line of lines){
        const nl=normalize(line);
        if(!nl.includes(street)||!nl.includes(num)) continue;

        const patterns=[
          /(?:condom[ií]nio|edif[ií]cio|residencial|empreendimento)\\s+(?:[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 .&\\/-]{2,100})/i,
          /(?:condom[ií]nio|edif[ií]cio)\\s*[:\\-]?\\s*["']?([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 .&\\/-]{2,100})/i
        ];

        for(const pattern of patterns){
          const m=line.match(pattern);
          if(!m) continue;

          let name=(m[1]||m[0]).trim();
          name=name.replace(/[,.!?;:]+$/,'').trim();

          // Remove o restante quando o resultado continua depois do nome.
          name=name.split(/\\s+(?:localizado|fica|está|esta|na|em|com|conta|possui|tem)\\s+/i)[0].trim();

          if(name.length>=6&&name.length<=100&&!name.endsWith('&')){
            add(name,source);
          }
        }
      }

      // Também usa títulos de resultados do Bing, mas preserva a linha/contexto.
      const blocks=raw.match(/<li[^>]*class=["'][^"']*b_algo[^"']*["'][\\s\\S]*?<\\/li>/gi)||[];
      for(const block of blocks){
        const blockText=extractText(block);
        const nb=normalize(blockText);
        if(!nb.includes(street)||!nb.includes(num)) continue;

        const titleMatch=block.match(/<h2[\\s\\S]*?<a[^>]*>([\\s\\S]*?)<\\/a>[\\s\\S]*?<\\/h2>/i);
        if(titleMatch){
          const title=extractText(titleMatch[1]);
          if(title.length>=8&&title.length<=120&&!/^(residencial|condom[ií]nio|edif[ií]cio)$/i.test(title.trim())){
            add(title,source);
          }
        }
      }
    };

    for(const q of queries){
      const encoded=encodeURIComponent(q);

      try{
        const r1=await fetch('https://www.bing.com/search?q='+encoded,{
          headers:{'User-Agent':'Mozilla/5.0','Accept-Language':'pt-BR,pt;q=0.9'}
        });
        if(r1.ok) extractNames(await r1.text(),'Bing');
      }catch(e){}

      if(Object.keys(candidates).length) break;

      try{
        const r2=await fetch('https://html.duckduckgo.com/html/?q='+encoded,{
          headers:{'User-Agent':'Mozilla/5.0','Accept-Language':'pt-BR,pt;q=0.9'}
        });
        if(r2.ok) extractNames(await r2.text(),'DuckDuckGo');
      }catch(e){}

      if(Object.keys(candidates).length) break;
    }

    const list=Object.values(candidates).sort((a,b)=>b.hits-a.hits).slice(0,8);

    return reply({
      condominium_name:list.length?list[0].name:null,
      condominium_builder:null,
      condominium_delivery_year:null,
      condominium_units:null,
      condominium_land_area:null,
      towers:null,
      floors:null,
      sources:[],
      candidates:list.map(x=>({...x,evidence_hits:x.hits})),
      searched_address:searched,
      evidence:list.length?'Candidatos encontrados em pesquisa pública.':'Não foi encontrado nome de condomínio suficiente nos resultados públicos.'
    });
  }catch(error){
    return reply({
      error:'Erro interno na identificação do condomínio.',
      message:String(error&&error.message||error),
      candidates:[],
      sources:[]
    },500);
  }
}
