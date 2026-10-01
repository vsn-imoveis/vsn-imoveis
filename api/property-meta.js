const SUPABASE_URL=process.env.SUPABASE_URL||'https://jpdfynaioepcmgqlqlht.supabase.co';
const SUPABASE_KEY=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||'sb_publishable_bDiXCzTT1gXO_xbVGhnAXg_Muy4lx03';

function slugPart(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' e ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').replace(/-+/g,'-').slice(0,70).replace(/-+$/,'');}
function propertySlug(p){
  const condo=slugPart(p.condominium_name), rua=slugPart(p.address), dorms=Number(p.bedrooms||0), area=Number(p.area||0);
  const type=(p.for_rent&&!p.for_sale)?'locacao':(p.for_sale&&!p.for_rent)?'venda':(p.transaction_type==='rent'?'locacao':p.transaction_type==='sale'?'venda':'imovel');
  return [condo,rua,dorms?dorms+'-dorm':null,area?Math.round(area)+'m2':null,type].filter(Boolean).join('-');
}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function meta(html,id,attrs){
  const re=new RegExp('<meta\\s+id="'+id+'"[^>]*>','i');
  const tag='<meta id="'+id+'" '+attrs+'>';
  return re.test(html)?html.replace(re,tag):html.replace('</head>',tag+'</head>');
}
export default async function handler(req,res){
  try{
    const slug=String(req.query?.slug||'').trim();
    if(!slug)return res.status(400).send('Slug não informado.');
    const api=SUPABASE_URL+'/rest/v1/properties?select=title,condominium_name,address,bedrooms,area,neighborhood,city,state,for_sale,for_rent,transaction_type,photos&published=eq.true';
    const r=await fetch(api,{headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY,Accept:'application/json'}});
    if(!r.ok)throw new Error('Supabase HTTP '+r.status);
    const rows=await r.json(), p=(Array.isArray(rows)?rows:[]).find(x=>propertySlug(x)===slug);
    const host=String(req.headers['x-forwarded-host']||req.headers.host||'vsn-imoveis.vercel.app').split(',')[0].trim();
    const origin='https://'+host;
    const canonical=origin+'/imovel/'+encodeURIComponent(slug);
    const page=await fetch(origin+'/imovel.html').then(x=>x.text());
    if(!p){res.setHeader('Content-Type','text/html; charset=utf-8');return res.status(404).send(page);}
    const kind=p.for_rent&&!p.for_sale?'Imóvel para locação':p.for_sale&&!p.for_rent?'Imóvel à venda':'Imóvel';
    const title=((p.title||kind+' em '+(p.neighborhood||p.city||'São Paulo'))+' | VSN Imóveis').slice(0,65);
    const description=[p.title||kind,p.neighborhood?'no bairro '+p.neighborhood:'',p.city?'em '+p.city:'',p.condominium_name?'Condomínio '+p.condominium_name:'',p.area?Number(p.area).toLocaleString('pt-BR')+' m²':'',p.bedrooms?Number(p.bedrooms)+' '+(Number(p.bedrooms)===1?'quarto':'quartos'):''].filter(Boolean).join(' · ').slice(0,155);
    const photos=Array.isArray(p.photos)?p.photos.filter(Boolean):[];
    const image=photos[0]||origin+'/hero-v12.jpg';
    let html=page;
    html=meta(html,'seoDescription','name="description" content="'+esc(description)+'"');
    html=meta(html,'seoCanonical','rel="canonical" href="'+esc(canonical)+'"');
    html=meta(html,'seoOgTitle','property="og:title" content="'+esc(title)+'"');
    html=meta(html,'seoOgDescription','property="og:description" content="'+esc(description)+'"');
    html=meta(html,'seoOgUrl','property="og:url" content="'+esc(canonical)+'"');
    html=meta(html,'seoOgImage','property="og:image" content="'+esc(image)+'"');
    html=html.replace(/<title>[^<]*<\\/title>/i,'<title>'+esc(title)+'</title>');
    html=html.replace('</head>','<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="'+esc(title)+'"><meta name="twitter:description" content="'+esc(description)+'"><meta name="twitter:image" content="'+esc(image)+'"></head>');
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=3600');
    return res.status(200).send(html);
  }catch(e){console.error('[VSN property meta]',e);return res.status(500).send('Erro ao carregar imóvel.');}
}