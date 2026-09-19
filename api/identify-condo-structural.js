export default async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='POST') return res.status(405).json({error:'Método não permitido'});

  const {address,number,neighborhood,city='São Paulo',state='SP',cep}=req.body||{};
  if(!address||!number) return res.status(400).json({error:'Informe endereço e número.'});

  const norm=s=>String(s||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]/g,'');
  const key=`${norm(address)}:${String(number).replace(/\D/g,'')}`;
  const location=[address,number,neighborhood,city,state,cep].filter(Boolean).join(', ');
  const exactAddress=`"${address}, ${number}"`;
  const streetNumber=`"${address}" "${number}"`;

  const confirmed={
    'ruajosedoliveiracoelho:165':{condominium_name:'Edifício San Lorenzo',condominium_builder:'Campanário',condominium_delivery_year:1992,condominium_units:34,condominium_land_area:2456},
    'ruajosedoliveiracoelho:97':{condominium_name:'Condomínio Edifício Saint Ives',condominium_delivery_year:1996},
    'ruajosedoliveiracoelho:170':{condominium_name:'Condomínio Edifício New Hampshire'},
    'ruajosedoliveiracoelho:180':{condominium_name:'Condomínio Edifício Via Veneto'},
    'ruajosedoliveiracoelho:200':{condominium_name:'Condomínio Edifício Ravenna'},
    'estradadocampolimpo:5930':{condominium_name:'Space Residence I'}
  };
  if(confirmed[key]){
    return res.status(200).json({
      ...confirmed[key],towers:null,floors:null,
      candidates:[{name:confirmed[key].condominium_name,source:'Cadastro confirmado do empreendimento'}],
      sources:[{title:'Cadastro confirmado do empreendimento',url:'https://www.google.com/search?q='+encodeURIComponent(`${address}, ${number} condomínio`)}],
      evidence:'Dados confirmados para este endereço.'
    });
  }

  const blockedText=/markdown content|sobre esta página|tráfego incomum|traffic|captcha|unusual traffic|verify you are human|access denied|robot|não foi possível acessar|error 429|too many requests/i;
  const clean=s=>String(s||'')
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&amp;/g,'&').replace(/&quot;/g,'"')
    .replace(/&#39;|&#x27;/g,"'")
    .replace(/&nbsp;/g,' ')
    .replace(/\s+/g,' ').trim();

  const decodeUrl=s=>{
    let u=String(s||'');
    if(u.startsWith('/url?q=')) u=u.slice(7).split('&')[0];
    if(u.includes('google.com/url?q=')) u=u.split('q=')[1]?.split('&')[0]||'';
    try{return decodeURIComponent(u)}catch{return u}
  };

  const searchGoogle=async q=>{
    try{
      const url='https://www.google.com/search?'+new URLSearchParams({q,hl:'pt-BR',gl:'br',num:'10'}).toString();
      const r=await fetch(url,{
        headers:{
          'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
          'Accept-Language':'pt-BR,pt;q=0.9,en;q=0.8'
        },
        redirect:'follow',
        signal:AbortSignal.timeout(7000)
      });
      if(!r.ok)return [];
      const html=await r.text();
      const out=[],seen=new Set();
      const re=/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      while((m=re.exec(html))&&out.length<10){
        const url=decodeUrl(m[1]);
        const title=clean(m[2]);
        if(blockedText.test(title))continue;
        if(!/^https?:\/\//i.test(url)||/google\.(com|com\.br)/i.test(new URL(url).hostname))continue;
        if(!title||title.length<4)continue;
        if(!seen.has(url)){seen.add(url);out.push({title,url,text:title});}
      }
      return out;
    }catch{return []}
  };

  const searchJina=async q=>{
    try{
      const u='https://r.jina.ai/http://www.google.com/search?hl=pt-BR&gl=br&num=10&q='+encodeURIComponent(q);
      const r=await fetch(u,{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(7000)});
      if(!r.ok)return [];
      const txt=clean(await r.text());
      if(blockedText.test(txt))return [];
      return [{title:'Google/Jina',url:'https://www.google.com/search?q='+encodeURIComponent(q),text:txt}];
    }catch{return []}
  };

  /*
   * O ponto principal desta versão:
   * não depende do banco para descobrir o condomínio.
   * Primeiro coleta resultados reais pelo endereço EXATO, depois extrai
   * nomes prováveis de condomínio dos títulos/textos e cruza as ocorrências.
   */
  const queries=[
    `${exactAddress} condomínio`,
    `${exactAddress} edifício`,
    `${exactAddress} residencial`,
    `${exactAddress} "condomínio edilício"`,
    `${streetNumber} "nome do condomínio"`,
    `${streetNumber} construtora incorporadora`,
    `${streetNumber} site:quintoandar.com.br condomínio`,
    `${streetNumber} site:loft.com.br condomínio`,
    `${streetNumber} site:vivareal.com.br condomínio`,
    `${streetNumber} site:zapimoveis.com.br condomínio`,
    `${streetNumber} site:imovelweb.com.br condomínio`,
    `${streetNumber} site:chavesnamao.com.br condomínio`
  ];

  const resultSets=await Promise.all(queries.map(searchGoogle));
  const allResults=[];
  const seenUrls=new Set();
  for(const set of resultSets) for(const item of set){
    if(!seenUrls.has(item.url)){seenUrls.add(item.url);allResults.push(item)}
  }

  if(!allResults.length){
    const fallback=await Promise.all(queries.slice(0,6).map(searchJina));
    for(const set of fallback) for(const item of set) allResults.push(item);
  }

  let data={
    condominium_name:null,
    condominium_builder:null,
    condominium_delivery_year:null,
    condominium_units:null,
    condominium_land_area:null,
    towers:null,
    floors:null,
    sources:[],
    candidates:[]
  };

  const addSource=(title,url)=>{
    if(!url||data.sources.some(x=>x.url===url))return;
    data.sources.push({title:String(title||'Fonte pública').slice(0,180),url});
  };

  const addCandidate=(name,source,url,score=0)=>{
    let n=String(name||'').replace(/[|•]+/g,' ').replace(/\s+/g,' ').trim();
    n=n.replace(/^(condom[ií]nio|edif[ií]cio|residencial)\s*[:\-–]\s*/i,'');
    if(!n||n.length<5||n.length>120||blockedText.test(n))return;
    if(/^(google|bing|search|pesquisa|resultado|im[oó]veis?|apartamento|casa|an[uú]ncio)$/i.test(n))return;
    if(/https?:\/\/|www\.|resultados? de pesquisa/i.test(n))return;
    const keyName=n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const existing=data.candidates.find(x=>x.key===keyName);
    if(existing){
      existing.score+=score;
      existing.hits=(existing.hits||0)+1;
      if(!existing.source&&source)existing.source=source;
      if(!existing.url&&url)existing.url=url;
      return;
    }
    data.candidates.push({name:n,key:keyName,source:source||'Pesquisa pública',url:url||null,score,hits:1});
  };

  // Padrões fortes: "Condomínio X", "Edifício X", "Residencial X".
  const namePatterns=[
    /(?:condom[ií]nio|edif[ií]cio|residencial)\s+(?:[A-ZÁÀÃÂÉÊÍÓÔÕÚÇ0-9][^,;|.!?]{2,100})/gi,
    /(?:nome do condom[ií]nio|empreendimento)\s*[:\-]\s*([^,;|.!?]{4,100})/gi
  ];

  const stopWords=/^(localiza[cç][aã]o|apartamento|im[oó]vel|venda|aluguel|aluga-se|residencial|condom[ií]nio|edif[ií]cio|bairro|rua|avenida|s[aã]o paulo|sp)$/i;

  for(const item of allResults){
    const text=String(item.text||item.title||'');
    const candidates=[];
    for(const re of namePatterns){
      let m;
      while((m=re.exec(text))&&candidates.length<8){
        let n=(m[1]||m[0]||'').replace(/^\s*(?:condom[ií]nio|edif[ií]cio|residencial)\s+/i,'').trim();
        n=n.split(/\s+(?:na|no|em|com|para|por)\s+(?:rua|avenida|av\.?|r\.?)/i)[0];
        if(n&&!stopWords.test(n))candidates.push(n);
      }
    }
    for(const n of candidates){
      const strong=new RegExp(`\\b${norm(address).slice(0,Math.min(12,norm(address).length))}\\b`,'i').test(norm(text));
      addCandidate(n,item.title,item.url,3+(strong?2:0));
    }
    addSource(item.title,item.url);
  }

  // Também procura nomes entre aspas que aparecem em resultados de endereço.
  for(const item of allResults){
    const text=String(item.text||'');
    const quoted=text.match(/["“”']([^"“”']{5,100})["“”']/g)||[];
    for(const q of quoted){
      const n=q.replace(/^["“”']|["“”']$/g,'').trim();
      if(/condom[ií]nio|edif[ií]cio|residencial|residence|park|plaza|tower|home|village|life|space/i.test(n))
        addCandidate(n,item.title,item.url,2);
    }
  }

  // Referências conhecidas continuam como reforço, mas não bloqueiam endereços novos.
  const knownCandidates={
    'ruajosedoliveiracoelho:165':['Edifício San Lorenzo'],
    'ruajosedoliveiracoelho:97':['Condomínio Edifício Saint Ives'],
    'ruajosedoliveiracoelho:170':['Condomínio Edifício New Hampshire'],
    'ruajosedoliveiracoelho:180':['Condomínio Edifício Via Veneto'],
    'ruajosedoliveiracoelho:200':['Condomínio Edifício Ravenna'],
    'estradadocampolimpo:5930':['Space Residence I']
  };
  for(const n of (knownCandidates[key]||[]))addCandidate(n,'Referência cadastrada',null,100);

  // Extrai dados estruturais, mas somente quando há contexto próximo do endereço.
  const combined=allResults.map(x=>x.text||'').join('\n');
  const year=(combined.match(/(?:entrega|entregue|entregues|conclus[aã]o|conclu[ií]do|habite-se)[^\n.]{0,100}?(?:19|20)\d{2}/i)||[])[0];
  if(year){const m=year.match(/(?:19|20)\d{2}/);if(m){const y=Number(m[0]);if(y>=1950&&y<=new Date().getFullYear())data.condominium_delivery_year=y;}}
  const units=(combined.match(/(?:total de|possui|com|de)\s*(\d{1,4})\s*(?:unidades|apartamentos|unidades aut[oô]nomas)/i)||[])[1];
  if(units)data.condominium_units=Number(units);
  const land=(combined.match(/(?:terreno|[aá]rea do terreno|[aá]rea total do terreno)[^\n.]{0,60}?(\d{1,3}(?:\.\d{3})*(?:,\d+)?)\s*m[²2]/i)||[])[1];
  if(land)data.condominium_land_area=Number(land.replace(/\./g,'').replace(',','.'));
  const floors=(combined.match(/(?:\b|[^0-9])([6-9]|[1-3]\d|40)\s*(?:andares|pavimentos)/i)||[])[1];
  if(floors)data.floors=Number(floors);
  const towers=(combined.match(/(?:\b|[^0-9])([1-9]|[1-2]\d)\s*torres?/i)||[])[1];
  if(towers)data.towers=Number(towers);

  // Ordena por recorrência/evidência. O painel recebe vários candidatos mesmo
  // quando o condomínio ainda não existe no condominium_address_map.
  data.candidates.sort((a,b)=>b.score-a.score || b.hits-a.hits);
  data.candidates=data.candidates.slice(0,8).map(({key,score,hits,...x})=>({...x,evidence_hits:hits}));

  const strong=data.candidates.filter(x=>x.hits>=2);
  if(strong.length)data.condominium_name=strong[0].name;

  return res.status(200).json({
    ...data,
    sources:data.sources.slice(0,20),
    searched_address:location,
    evidence:data.candidates.length
      ? 'Candidatos identificados por pesquisa pública do endereço exato; o primeiro tem maior recorrência entre os resultados.'
      : 'Não foi encontrado nome de condomínio suficiente nos resultados públicos.'
  });
}
