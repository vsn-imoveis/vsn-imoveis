export default async function handler(req,res){
  try{
    if(req.method!=='POST') return res.status(405).json({error:'Método não permitido'});

    const {address,number,cep,city,state}=req.body||{};
    if(!address||!number) return res.status(400).json({error:'Informe endereço e número.'});

    const cepClean=String(cep||'').replace(/\D/g,'');
    const exactAddress=[address,number,city,state].filter(Boolean).join(', ');
    const query='"'+address+'" "'+number+'" "'+(cepClean||city||'')+'" condomínio';

    // Pesquisa pública direta na internet. Sem OpenAI, sem Google API,
    // sem chave e sem lista fixa de condomínios.
    const searchUrl='https://www.google.com/search?'+new URLSearchParams({
      q:query,
      hl:'pt-BR',
      num:'10'
    }).toString();

    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),8000);

    let rr;
    try{
      rr=await fetch(searchUrl,{
        signal:controller.signal,
        headers:{
          'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
          'Accept-Language':'pt-BR,pt;q=0.9'
        }
      });
    }finally{
      clearTimeout(timer);
    }

    if(!rr.ok){
      return res.status(502).json({
        error:'O buscador não respondeu corretamente.',
        debug:{http_status:rr.status,query}
      });
    }

    const html=await rr.text();

    const strip=s=>String(s||'')
      .replace(/<script[\\s\\S]*?<\\/script>/gi,' ')
      .replace(/<style[\\s\\S]*?<\\/style>/gi,' ')
      .replace(/<[^>]+>/g,' ')
      .replace(/&amp;/g,'&')
      .replace(/&quot;/g,'"')
      .replace(/&#39;|&#x27;/g,"'")
      .replace(/&nbsp;/g,' ')
      .replace(/\\s+/g,' ')
      .trim();

    const results=[];
    const linkRe=/<a[^>]+href="([^"]+)"[^>]*>([\\s\\S]*?)<\\/a>/gi;
    let m;
    while((m=linkRe.exec(html))!==null && results.length<30){
      let url=m[1]||'';
      const title=strip(m[2]);
      if(!title||!url) continue;

      if(url.startsWith('/url?q=')){
        url=url.slice(7).split('&')[0];
        try{url=decodeURIComponent(url)}catch(_){}
      }
      if(!/^https?:\\/\\//i.test(url)) continue;
      if(/google\\.com|googleusercontent\\.com/i.test(url)) continue;
      if(title.length<3||title.length>300) continue;

      results.push({title,url});
    }

    const unique=[];
    const seen=new Set();
    for(const item of results){
      if(seen.has(item.url)) continue;
      seen.add(item.url);
      unique.push(item);
    }

    // Busca evidência textual do endereço nos títulos retornados.
    const street=String(address).toLowerCase();
    const n=String(number).toLowerCase();
    const scored=unique.map(x=>{
      const t=(x.title+' '+x.url).toLowerCase();
      let score=0;
      if(t.includes(n)) score+=5;
      if(t.includes(street)) score+=8;
      if(cepClean&&t.includes(cepClean)) score+=10;
      if(/condominio|condomínio|residencial|residence|edificio|edifício|parque|park/.test(t)) score+=4;
      if(/quintoandar|loft|vivareal|zap|imovelweb|123i|attria/.test(t)) score+=3;
      return {...x,score};
    }).sort((a,b)=>b.score-a.score);

    const top=scored.slice(0,15);

    // O nome só é aceito quando aparece claramente em um título de resultado
    // junto com indicação de condomínio/residencial. Nada é pré-cadastrado.
    const candidates=new Map();
    for(const x of top){
      const title=x.title.replace(/\\s+/g,' ').trim();
      const condoMatch=title.match(/(?:condominio|condomínio|residencial|residence|edificio|edifício)\\s+(.{3,100}?)(?:\\s+[|–-]\\s+|$)/i);
      if(condoMatch){
        const name=condoMatch[1].replace(/[.,;:]+$/,'').trim();
        if(name.length>=3){
          const key=name.toLowerCase();
          candidates.set(key,{name,count:(candidates.get(key)?.count||0)+1});
        }
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
        : 'A busca foi realizada, mas não houve evidência suficiente para identificar o condomínio automaticamente.',
      sources:top.map(x=>({title:x.title,url:x.url})),
      debug:{
        request:{address,number,cep:cepClean,city,state,exact_address:exactAddress},
        provider:'Google Web Search (página pública)',
        query,
        result_count:unique.length,
        top_results:top
      }
    });
  }catch(e){
    return res.status(500).json({
      error:'Erro interno da API.',
      details:String(e?.message||e),
      debug:{stage:'identify-condo',name:e?.name||null}
    });
  }
}