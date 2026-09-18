export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');

  if(req.method==='OPTIONS'){
    return res.status(204).end();
  }

  try{
    if(req.method!=='POST') return res.status(405).json({error:'Método não permitido'});

    const {address,number,cep,city,state}=req.body||{};
    if(!address||!number) return res.status(400).json({error:'Informe endereço e número.'});

    const cepClean=String(cep||'').replace(/\D/g,'');
    const exactAddress=[address,number,city,state].filter(Boolean).join(', ');

    const queries=[
      `"${address}" "${number}" "${cepClean}" condomínio`,
      `"${address}" "${number}" "${city}" condomínio`,
      `"${address}" "${number}" condomínio`
    ];

    const results=[];
    const headers={
      'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
      'Accept-Language':'pt-BR,pt;q=0.9,en;q=0.8'
    };

    // Pesquisa pública diretamente na internet, sem lista fixa e sem API paga.
    // As consultas rodam em paralelo para não estourar o tempo da função na Vercel.
    const searchOne=async q=>{
      const url='https://html.duckduckgo.com/html/?'+new URLSearchParams({q,kl:'br-pt'}).toString();
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),4500);
      try{
        const rr=await fetch(url,{
          headers:{
            'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
            'Accept-Language':'pt-BR,pt;q=0.9,en;q=0.8'
          },
          redirect:'follow',
          signal:controller.signal
        });
        if(!rr.ok)return [];
        const html=await rr.text();
        const clean=s=>String(s||'')
          .replace(/<[^>]*>/g,' ')
          .replace(/&amp;/g,'&').replace(/&quot;/g,'"')
          .replace(/&#x27;|&#39;/g,"'")
          .replace(/&nbsp;/g,' ')
          .replace(/\\s+/g,' ').trim();
        const blocks=html.split(/<div[^>]+class=["'][^"']*result[^"']*["'][^>]*>/i).slice(1);
        const out=[];
        for(const block of blocks.slice(0,10)){
          const titleMatch=block.match(/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]*>([\\s\\S]*?)<\\/a>/i);
          const hrefMatch=block.match(/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["']/i)
            || block.match(/<a[^>]+href=["']([^"']+)["'][^>]+class=["'][^"']*result__a[^"']*["']/i);
          const snippetMatch=block.match(/<a[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\\s\\S]*?)<\\/a>/i)
            || block.match(/<div[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>/i);
          const title=clean(titleMatch?.[1]);
          let href=hrefMatch?.[1]||'';
          const snippet=clean(snippetMatch?.[1]);
          if(href.startsWith('//'))href='https:'+href;
          if(title&&href)out.push({query:q,title,url:href,snippet});
        }
        return out;
      }catch(e){
        return [];
      }finally{
        clearTimeout(timeout);
      }
    };
    const batches=await Promise.all(queries.map(searchOne));
    const results=batches.flat();

    const unique=[];
    const seen=new Set();
    for(const x of results){
      if(!x.url||seen.has(x.url)) continue;
      seen.add(x.url);
      unique.push(x);
    }

    const normalize=s=>String(s||'')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,' ')
      .trim();

    const addressNorm=normalize(exactAddress);
    const cityNorm=normalize(city);
    const numberNorm=String(number).toLowerCase().trim();

    const scored=unique.map(x=>{
      const text=normalize(x.title+' '+x.snippet+' '+x.url);
      let score=0;
      if(cepClean&&text.includes(normalize(cepClean))) score+=12;
      if(numberNorm&&text.includes(numberNorm)) score+=7;
      const street=normalize(address);
      if(street&&text.includes(street)) score+=8;
      if(cityNorm&&text.includes(cityNorm)) score+=2;
      if(/condominio|residencial|residence|edificio|predio|parque|park/.test(text)) score+=4;
      if(/quintoandar|loft|vivareal|zap|imovelweb|123i|attria/.test(text)) score+=3;
      return {...x,score};
    }).sort((a,b)=>b.score-a.score);

    const top=scored.slice(0,20);

    // Tenta extrair apenas nomes que aparecem explicitamente associados
    // ao endereço. Nenhum nome é pré-cadastrado.
    const candidates=new Map();
    for(const x of top){
      const raw=x.title+' '+x.snippet;
      const text=normalize(raw);
      const addressEvidence=
        (cepClean&&text.includes(normalize(cepClean))) ||
        text.includes(numberNorm);
      if(!addressEvidence) continue;

      const patterns=[
        /(?:condominio|condominio residencial|residencial|residence|edificio|edificio residencial)\s+([^|•,;–—]+?)(?=\s+(?:na|no|em|localizado|localizada|rua|avenida|av|estrada|r|cep)\b|$)/i,
        /(?:apartamento|imovel|imóvel)[^\n]{0,120}\b(?:no|na|do|da)\s+(?:condominio|residencial|residence)\s+([^|•,;–—]+?)(?=\s+(?:em|na|no|rua|avenida|estrada|cep)\b|$)/i
      ];

      let name='';
      for(const p of patterns){
        const m=raw.match(p);
        if(m){name=m[1].replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();break;}
      }

      if(!name){
        // Muitos portais colocam o nome no título antes do endereço.
        const title=x.title.replace(/\s+/g,' ').trim();
        const m=title.match(/^(.{3,100}?)\s*[|–-]\s*(?:rua|avenida|av\.?|estrada|r\.?)/i);
        if(m&&/condominio|residencial|residence|edificio|parque|park/i.test(m[1])) name=m[1].trim();
      }

      if(name){
        name=name.replace(/^condominio\s+/i,'').replace(/^condomínio\s+/i,'').trim();
        name=name.replace(/[.,;:]+$/,'').trim();
        if(name.length>=3&&name.length<=120){
          const key=normalize(name);
          const old=candidates.get(key);
          candidates.set(key,{name,count:(old?.count||0)+1,source:x.url});
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
        ? 'Condomínio identificado por pesquisa pública na internet.'
        : 'Resultados encontrados, mas sem evidência textual suficiente para identificar o condomínio com segurança.',
      sources:top.map(x=>({title:x.title,url:x.url,snippet:x.snippet})),
      debug:{
        request:{address,number,cep:cepClean,city,state,exact_address:exactAddress},
        provider:'DuckDuckGo HTML',
        queries,
        result_count:unique.length,
        top_results:top
      }
    });
  }catch(e){
    return res.status(500).json({
      error:'Erro interno da API.',
      details:String(e?.message||e),
      debug:{stage:'identify-condo'}
    });
  }
}