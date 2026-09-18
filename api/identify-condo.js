export default async function handler(req,res){
  if(req.method!=='POST'){
    return res.status(405).json({error:'Método não permitido'});
  }

  const body=req.body||{};
  const {address,number,cep,city,state}=body;

  if(!address||!number){
    return res.status(400).json({error:'Informe endereço e número.'});
  }

  const cepClean=String(cep||'').replace(/\D/g,'');
  const query=[address,number,cepClean,city,state,'condomínio'].filter(Boolean).join(' ');

  try{
    const url='https://www.bing.com/search?'+new URLSearchParams({
      format:'rss',
      q:query
    }).toString();

    const response=await fetch(url,{
      headers:{
        'User-Agent':'Mozilla/5.0',
        'Accept':'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8'
      }
    });

    if(!response.ok){
      return res.status(502).json({
        error:'O buscador recusou a pesquisa.',
        debug:{stage:'search',provider:'Bing RSS',status:response.status,query}
      });
    }

    const xml=await response.text();

    const decode=(value)=>String(value||'')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
      .replace(/&amp;/g,'&')
      .replace(/&quot;/g,'"')
      .replace(/&#39;|&#x27;/g,"'")
      .replace(/&lt;/g,'<')
      .replace(/&gt;/g,'>')
      .trim();

    const clean=(value)=>decode(value)
      .replace(/<[^>]+>/g,' ')
      .replace(/\s+/g,' ')
      .trim();

    const sources=[];
    const itemRe=/<item>([\s\S]*?)<\/item>/gi;
    let itemMatch;

    while((itemMatch=itemRe.exec(xml))!==null && sources.length<10){
      const item=itemMatch[1];
      const title=item.match(/<title>([\s\S]*?)<\/title>/i);
      const link=item.match(/<link>([\s\S]*?)<\/link>/i);
      const description=item.match(/<description>([\s\S]*?)<\/description>/i);

      const t=clean(title&&title[1]);
      const l=decode(link&&link[1]);
      const d=clean(description&&description[1]);

      if(t&&/^https?:\/\//i.test(l)){
        sources.push({title:t,url:l,snippet:d});
      }
    }

    return res.status(200).json({
      ok:true,
      condominium_name:'',
      name_variants:[],
      confidence:'baixa',
      evidence:sources.length
        ? 'Pesquisa pública realizada. A identificação automática do condomínio será adicionada na próxima etapa.'
        : 'Pesquisa realizada, mas o buscador não retornou resultados.',
      sources,
      debug:{
        stage:'search',
        provider:'Bing RSS',
        query,
        result_count:sources.length,
        request:{address,number,cep:cepClean,city,state}
      }
    });
  }catch(error){
    console.error('identify-condo search error',error);
    return res.status(502).json({
      error:'Não foi possível acessar o buscador.',
      details:String(error?.message||error),
      debug:{
        stage:'search',
        provider:'Bing RSS',
        query
      }
    });
  }
}