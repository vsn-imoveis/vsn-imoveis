export default async function handler(req,res){
  try{
    if(req.method!=='POST') return res.status(405).json({error:'Método não permitido'});
    const {address,number,cep,city,state}=req.body||{};
    if(!address||!number) return res.status(400).json({error:'Informe endereço e número.'});

    const clean=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/\\s+/g,' ').trim();
    const norm=s=>String(s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/\\bestr\\.?\\b/g,'estrada').replace(/\\br\\.?\\b/g,'rua').replace(/\\bav\\.?\\b/g,'avenida').replace(/[^a-z0-9]+/g,' ').trim();
    const cepClean=String(cep||'').replace(/\\D/g,'');
    const exact=`${address}, ${number}`;
    const queries=[
      `"${cepClean}" "${address}" "${number}" condomínio ${city||''}`,
      `"${exact}" condomínio`
    ];

    const search=async q=>{
      const url='https://www.google.com/search?q='+encodeURIComponent(q)+'&hl=pt-BR&gl=br&num=10';
      const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),5500);
      try{
        const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0'},signal:ctrl.signal});
        if(!r.ok)return [];
        const html=await r.text();
        const out=[]; const re=/<a href="(https?:\\/\\/[^"]+)"[^>]*>([\\s\\S]*?)<\\/a>/gi;
        let m;
        while((m=re.exec(html))&&out.length<10){
          if(/google\\./i.test(m[1]))continue;
          const title=clean(m[2]);
          if(title.length>3)out.push({title,url:m[1],text:clean(m[2])});
        }
        return out;
      }finally{clearTimeout(timer)}
    };

    const batches=await Promise.all(queries.map(search));
    const results=batches.flat();
    const street=norm(address), num=String(number).trim(), cepN=cepClean;
    const scored=results.map(x=>{
      const t=norm(x.title+' '+x.text); let score=0;
      if(cepN && t.includes(cepN))score+=100;
      if(street && t.includes(street))score+=80;
      if(num && t.includes(norm(num)))score+=80;
      if(/condominio|residencial|residence|parque das orquideas|liber park/i.test(t))score+=40;
      return {...x,score};
    }).sort((a,b)=>b.score-a.score);

    const best=scored.find(x=>x.score>=120 && /condominio|residencial|residence/i.test(norm(x.title+' '+x.text)));
    if(!best)return res.status(200).json({
      condominium_name:'',confidence:'baixa',features:[],
      evidence:`Busca realizada com CEP + endereço + número, mas não houve correspondência suficiente para ${exact}.`,
      sources:scored.slice(0,5)
    });

    let name=clean(best.title);
    name=name.replace(/\\s*[|–—-].*$/,'').trim();
    return res.status(200).json({
      condominium_name:name,
      confidence:'alta',
      features:[],
      evidence:`Endereço consultado: ${exact}. CEP: ${cepClean||'não informado'}. Resultado encontrado em busca pública.`,
      sources:scored.slice(0,5)
    });
  }catch(e){
    return res.status(500).json({error:'Erro interno da API.',details:String(e?.message||e)});
  }
}
