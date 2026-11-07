const SUPABASE_URL=process.env.SUPABASE_URL||'https://jpdfynaioepcmgqlqlht.supabase.co';
const SUPABASE_KEY=process.env.SUPABASE_ANON_KEY||'sb_publishable_bDiXCzTT1gXO_xbVGhnAXg_Muy4lx03';
export default async function handler(req,res){
  try{
    const r=await fetch(SUPABASE_URL+'/rest/v1/site_settings?select=site_share_image_url& id=eq.true'.replace(' &','&'),{headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY}});
    const rows=await r.json();
    const target=rows?.[0]?.site_share_image_url||'https://vsn-imoveis.vercel.app/logo-vsn.png';
    res.setHeader('Cache-Control','public, max-age=300, s-maxage=300');
    return res.redirect(302,target);
  }catch(e){
    return res.redirect(302,'https://vsn-imoveis.vercel.app/logo-vsn.png');
  }
}