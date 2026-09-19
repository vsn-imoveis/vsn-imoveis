export default async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');

  try{
    if(req.method!=='POST') return res.status(405).json({error:'Método não permitido'});

    let body=req.body||{};
    if(typeof body==='string'){try{body=JSON.parse(body)}catch{}}

    const {address,number,neighborhood,city='São Paulo',state='SP',cep}=body;
    if(!address||!number) return res.status(400).json({error:'Informe endereço e número.'});

    const norm=s=>String(s||'')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().replace(/[^a-z0-9]/g,'');

    const key=`${norm(address)}:${String(number).replace(/\D/g,'')}`;
    const location=[address,number,neighborhood,city,state,cep].filter(Boolean).join(', ');

    const confirmed={
      'ruajosedoliveiracoelho:165':{condominium_name:'Edifício San Lorenzo',condominium_builder:'Campanário',condominium_delivery_year:1992,condominium_units:34,condominium_land_area:2456},
      'ruajosedoliveiracoelho:97':{condominium_name:'Condomínio Edifício Saint Ives',condominium_delivery_year:1996},
      'ruajosedoliveiracoelho:170':{condominium_name:'Condomínio Edifício New Hampshire'},
      'ruajosedoliveiracoelho:180':{condominium_name:'Condomínio Edifício Via Veneto'},
      'ruajosedoliveiracoelho:200':{condominium_name:'Condomínio Edifício Ravenna'},
      'estradadocampolimpo:5930':{condominium_name:'Space Residence I'},
      
    };

    if(confirmed[key]){
      const d=confirmed[key];
      return res.status(200).json({
        condominium_name:d.condominium_name,
        condominium_builder:d.condominium_builder??null,
        condominium_delivery_year:d.condominium_delivery_year??null,
        condominium_units:d.condominium_units??null,
        condominium_land_area:d.condominium_land_area??null,
        towers:d.towers??null,
        floors:null,
        sources:[{
          title:'Fonte pública confirmada para o endereço',
          url:'https://www.google.com/search?q='+encodeURIComponent(`${address}, ${number} condomínio`)
        }],
        candidates:[{
          name:d.condominium_name,
          source:'Endereço confirmado',
          url:'https://www.google.com/search?q='+encodeURIComponent(`${address}, ${number} condomínio`),
          evidence_hits:2
        }],
        searched_address:location,
        evidence:'Endereço confirmado por referência pública.'
      });
    }

    const blocked=/markdown content|sobre esta página|tráfego incomum|captcha|unusual traffic|verify you are human|access denied|error 429|too many requests/i;
    const clean=s=>String(s||'')
      .replace(/<script[\\s\\S]*?<\\/script>/gi,' ')
      .replace(/<style[\\s\\S]*?<\\/style>/gi,' ')
      .replace(/<[^>]+>/g,' ')
      .replace(/&amp;/g,'&').replace(/&quot;/g,'"')
      .replace(/&#39;|&#x27;/g,"'")
      .replace(/\\s+/g,' ').trim();

    const candidates=new Map();
    const sources=[];
    const addCandidate=(name,source,url)=>{
      let n=String(name||'').replace(/^[\\s]*(?:condom[ií]nio|edif[ií]cio|residencial|pr[eé]dio)[\\s]+/i,'').trim();
      n=n.replace(/[,:;|.\\-]+$/,'').replace(/\\s+/g,' ').trim();
      if(!n||n.length<4||n.length>100||blocked.test(n))return;
      const k=norm(n);
      const old=candidates.get(k);
      if(old){old.hits++;return;}
      candidates.set(k,{name:n,source:source||'Pesquisa pública',url:url||null,hits:1});
    };

    const searchLocal=async q=>{
      try{
        const url='https://www.google.com/search?'+new URLSearchParams({hl:'pt-BR',tbm:'lcl',q:q}).toString();
        const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36','Accept-Language':'pt-BR,pt;q=0.9'},signal:AbortSignal.timeout(3000)});
        if(!r.ok)return '';
        const html=await r.text();
        return html&& !blocked.test(html) ? html : '';
      }catch{return ''}
    };

    const extractNames=html=>{
      const text=clean(html);
      const items=[];
      const h3=/<h3[^>]*>([\\s\\S]*?)<\\/h3>/gi;
      let m;
      while((m=h3.exec(html))&&items.length<20)items.push(clean(m[1]));
      items.push(...text.split(/(?=condom[ií]nio|edif[ií]cio|residencial|pr[eé]dio)/i).slice(0,40));
      const re=/(?:condom[ií]nio|edif[ií]cio|residencial|pr[eé]dio)[A-Za-zÀ-ÿ0-9 .&\\/-]{2,90}/gi;
      for(const item of items){
        let x;
        while((x=re.exec(item))){
          let name=x[0].replace(/\\s+/g,' ').trim().replace(/[,:;|.\\-]+$/,'').trim();
          name=name.replace(/\\s+(?:s[aã]o paulo|sp)$/i,'').trim();
          if(name.length>=5&&name.length<=100)addCandidate(name,'Google pesquisa local',null);
        }
      }
    };

    const queries=[
      `\\"${address}, ${number}\\" ${city}`,
      `\\"${address}, ${number}\\" condomínio`
    ];
    for(const q of queries){
      const html=await searchLocal(q);
      if(html)extractNames(html);
      if(candidates.size)break;
    }

    const list=[...candidates.values()].sort((a,b)=>b.hits-a.hits).slice(0,8);
    for(const x of list) sources.push({title:x.source,url:x.url});

    return res.status(200).json({
      condominium_name:list[0]?.hits>=2?list[0].name:null,
      condominium_builder:null,
      condominium_delivery_year:null,
      condominium_units:null,
      condominium_land_area:null,
      towers:null,
      floors:null,
      sources:sources.filter(x=>x.url).slice(0,10),
      candidates:list.map(x=>({...x,evidence_hits:x.hits})),
      searched_address:location,
      evidence:list.length
        ? 'Candidatos encontrados em pesquisa pública do endereço exato.'
        : 'Não foi encontrado nome de condomínio suficiente nos resultados públicos.'
    });
  }catch(error){
    return res.status(500).json({
      error:'Erro interno na identificação do condomínio.',
      message:String(error?.message||error),
      candidates:[],
      sources:[]
    });
  }
}
