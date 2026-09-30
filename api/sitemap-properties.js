const SUPABASE_URL=process.env.SUPABASE_URL||'https://jpdfynaioepcmgqlqlht.supabase.co';
const SUPABASE_KEY=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||'sb_publishable_bDiXCzTT1gXO_xbVGhnAXg_Muy4lx03';
function slugPart(v){
  return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/&/g,' e ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').replace(/-+/g,'-').slice(0,70).replace(/-+$/,'');
}
function propertyUrl(p){
  const condo=slugPart(p.condominium_name||'');
  const bairro=slugPart(p.neighborhood||p.city||'sao-paulo');
  const base=[condo,bairro].filter(Boolean).join('-')||slugPart(p.title)||'imovel';
  return 'https://vsn-imoveis.vercel.app/imovel/'+base+'-'+p.id;
}
function xmlEscape(v){
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}
export default async function handler(req,res){
  try{
    const url=SUPABASE_URL+'/rest/v1/public_properties?select=id,title,condominium_name,neighborhood,city,created_at&published=eq.true&order=updated_at.desc';
    const r=await fetch(url,{headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY,Accept:'application/json'}});
    if(!r.ok)throw new Error('Supabase HTTP '+r.status);
    const rows=await r.json();
    const urls=[{loc:'https://vsn-imoveis.vercel.app/',lastmod:new Date().toISOString().slice(0,10),changefreq:'daily',priority:'1.0'}];
    for(const p of Array.isArray(rows)?rows:[]){
      urls.push({loc:propertyUrl(p),lastmod:String(p.updated_at||p.created_at||'').slice(0,10),changefreq:'weekly',priority:'0.8'});
    }
    const body='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.map(u=>'  <url><loc>'+xmlEscape(u.loc)+'</loc>'+(u.lastmod?'<lastmod>'+xmlEscape(u.lastmod)+'</lastmod>':'')+'<changefreq>'+u.changefreq+'</changefreq><priority>'+u.priority+'</priority></url>').join('\n')+'\n</urlset>';
    res.setHeader('Content-Type','application/xml; charset=utf-8');
    res.setHeader('Cache-Control','public, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).send(body);
  }catch(e){
    console.error('[VSN sitemap]',e);
    res.setHeader('Content-Type','application/xml; charset=utf-8');
    res.status(500).send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
  }
}