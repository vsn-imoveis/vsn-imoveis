export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método não permitido'});
  try{
    const {address,number,cep,city,state}=req.body||{};
    if(!address||!number) return res.status(400).json({error:'Informe endereço e número.'});

    const cepClean=String(cep||'').replace(/\D/g,'');
    const exactAddress=[address,number,city,state].filter(Boolean).join(', ');
    const query=[address,number,cepClean,city,'condomínio'].filter(Boolean).join(' ');

    let html='';
    try{
      const u='https://www.google.com/search?'+new URLSearchParams({
        q:query,
        hl:'pt-BR',
        num:'10'
      }).toString();

      const response=await fetch(u,{
        headers:{
          'User-Agent':'Mozilla/5.0',
          'Accept-Language':'pt-BR,pt;q=0.9'
        }
      });

      if(!response.ok){
        return res.status(502).json({
          error:'O buscador recusou a pesquisa.',
          debug:{provider:'Google',status:response.status,query}
        });
      }

      html=await response.text();
    }catch(searchError){
      return res.status(502).json({
        error:'Não foi possível acessar o buscador.',
        details:String(searchError?.message||searchError),
        debug:{provider:'Google',query}
      });
    }

    const clean=(value)=>{
      return String(value||'')
        .replace(/<script[\\s\\S]*?<\\/script>/gi,' ')
        .replace(/<style[\\s\\S]*?<\\/style>/gi,' ')
        .replace(/<[^>]+>/g,' ')
        .replace(/&amp;/g,'&')
        .replace(/&quot;/g,'"')
        .replace(/&#39;|&#x27;/g,"'")
        .replace(/&nbsp;/g,' ')
        .replace(/\\s+/g,' ')
        .trim();
    };

    const results=[];
    const re=/<a[^>]+href="([^"]+)"[^>]*>([\\s\\S]*?)<\\/a>/gi;
    let match;

    while((match=re.exec(html))!==null && results.length<30){
      let url=match[1]||'';
      const title=clean(match[2]);

      if(url.startsWith('/url?q=')){
        url=url.substring(7).split('&')[0];
        try{url=decodeURIComponent(url)}catch(_){}
      }

      if(!/^https?:\\/\\//i.test(url)) continue;
      if(/(^|\\.)google\\./i.test(url)) continue;
      if(!title||title.length<3) continue;

      results.push({title,url});
    }

    const unique=[];
    const seen=new Set();

    for(const item of results){
      if(seen.has(item.url)) continue;
      seen.add(item.url);
      unique.push(item);
    }

    const norm=(s)=>String(s||'')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,' ')
      .trim();

    const street=norm(address);
    const num=String(number).trim();
    const cepN=norm(cepClean);
    const cityN=norm(city);

    const scored=unique.map(item=>{
      const text=norm(item.title+' '+item.url);
      let score=0;

      if(street&&text.includes(street)) score+=10;
      if(num&&text.includes(num)) score+=6;
      if(cepN&&text.includes(cepN)) score+=10;
      if(cityN&&text.includes(cityN)) score+=2;
      if(/condominio|residencial|residence|edificio|parque|park/.test(text)) score+=4;

      return {...item,score};
    }).sort((a,b)=>b.score-a.score);

    const top=scored.slice(0,15);

    // Não existe catálogo de condomínios.
    // O nome só é aceito se aparecer no próprio resultado da busca.
    const candidates=new Map();

    for(const item of top){
      const title=item.title.replace(/\\s+/g,' ').trim();

      const patterns=[
        /condom[ií]nio\\s+(.{3,100}?)(?:\\s*[|–-]\\s*|$)/i,
        /residencial\\s+(.{3,100}?)(?:\\s*[|–-]\\s*|$)/i,
        /residence\\s+(.{3,100}?)(?:\\s*[|–-]\\s*|$)/i
      ];

      for(const pattern of patterns){
        const found=title.match(pattern);
        if(!found) continue;

        const name=found[1].replace(/[.,;:]+$/,'').trim();
        if(name.length<3||name.length>120) continue;

        const key=norm(name);
        const old=candidates.get(key);
        candidates.set(key,{name,count:(old?.count||0)+1});
        break;
      }
    }

    let condominium_name='';
    let confidence='baixa';

    if(candidates.size){
      const ranked=[...candidates.values()].sort((a,b)=>b.count-a.count);
      condominium_name=ranked[0].name;
      confidence=ranked[0].count>=2?'alta':'media';
    }

    return res.status(200).json({
      condominium_name,
      name_variants:[],
      confidence,
      evidence:condominium_name
        ? 'Identificado por pesquisa pública na internet.'
        : 'Pesquisa realizada, mas sem evidência suficiente para identificar o condomínio automaticamente.',
      sources:top.map(item=>({title:item.title,url:item.url})),
      debug:{
        request:{address,number,cep:cepClean,city,state,exact_address:exactAddress},
        provider:'Google Web Search',
        query,
        result_count:unique.length,
        top_results:top
      }
    });

  }catch(error){
    console.error('identify-condo error',error);
    return res.status(500).json({
      error:'Erro interno ao pesquisar condomínio.',
      details:String(error?.message||error),
      debug:{stage:'identify-condo'}
    });
  }
}