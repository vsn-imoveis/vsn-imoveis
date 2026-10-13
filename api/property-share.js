const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jpdfynaioepcmgqlqlht.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_bDiXCzTT1gXO_xbVGhnAXg_Muy4lx03';
const SITE = 'https://vsn-imoveis.vercel.app';

function slugPart(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' e ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-')
    .slice(0, 70).replace(/-+$/g, '');
}
function propertySlug(p) {
  const condo = slugPart(p.condominium_name || '');
  const street = slugPart(p.address || '');
  const beds = Number(p.bedrooms || 0);
  const area = Number(p.area || 0);
  const type = (p.for_rent && !p.for_sale) ? 'locacao' : (p.for_sale && !p.for_rent) ? 'venda' :
    (p.transaction_type === 'rent' ? 'locacao' : p.transaction_type === 'sale' ? 'venda' : 'imovel');
  return [condo, street, beds ? beds + '-dorm' : null, area ? Math.round(area) + 'm2' : null, type].filter(Boolean).join('-');
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function setMeta(html, selector, value) {
  const escaped = escapeHtml(value);
  const re = new RegExp('(<meta\\s+[^>]*(?:id="' + selector + '"|property="' + selector + '"|name="' + selector + '")[^>]*content=")[^"]*(")', 'i');
  if (re.test(html)) return html.replace(re, '$1' + escaped + '$2');
  return html.replace('</head>', '<meta property="' + selector + '" content="' + escaped + '"></head>');
}

export default async function handler(req, res) {
  try {
    const slug = String(req.query?.slug || '').trim();
    if (!slug) return res.status(400).send('Slug do imóvel não informado.');

    const api = await fetch(SUPABASE_URL + '/rest/v1/public_properties?select=id,title,photos,photo_thumbnails,price,rent_price,area,bedrooms,neighborhood,city,for_sale,for_rent,transaction_type,condominium_name,address&published=eq.true', {
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, Accept: 'application/json' }
    });
    if (!api.ok) throw new Error('Supabase HTTP ' + api.status);
    const rows = await api.json();
    const p = (Array.isArray(rows) ? rows : []).find(item => propertySlug(item) === slug);
    if (!p) {
      res.setHeader('Cache-Control', 'no-store');
      return res.redirect(302, SITE + '/imovel.html?slug=' + encodeURIComponent(slug));
    }

    const page = await fetch(SITE + '/imovel.html', { headers: { Accept: 'text/html' } });
    if (!page.ok) throw new Error('Não foi possível carregar a página-base do imóvel.');
    let html = await page.text();

    const title = (p.title || p.condominium_name || 'Imóvel') + ' | VSN Imóveis';
    const details = [p.neighborhood, p.city, p.area ? Number(p.area) + ' m²' : null, p.bedrooms ? Number(p.bedrooms) + ' dormitórios' : null].filter(Boolean).join(' · ');
    const description = details ? title.replace(' | VSN Imóveis', '') + ' — ' + details + '. Confira fotos e informações na VSN Imóveis.' : title;
    const photo = (Array.isArray(p.photos) && p.photos.find(x => typeof x === 'string' && /^https?:\/\//i.test(x))) ||
      (Array.isArray(p.photo_thumbnails) && p.photo_thumbnails.find(x => typeof x === 'string' && /^https?:\/\//i.test(x))) ||
      SITE + '/api/site-share-image';

    html = html.replace(/<title>[^<]*<\/title>/i, '<title>' + escapeHtml(title) + '</title>');
    html = html.replace(/(<meta\\s+id="seoDescription"[^>]*content=")[^"]*(")/i, '$1' + escapeHtml(description) + '$2');
    html = html.replace(/(<link\\s+id="seoCanonical"[^>]*href=")[^"]*(")/i, '$1' + SITE + '/imovel/' + encodeURIComponent(slug) + '$2');
    html = html.replace(/(<meta\\s+id="seoOgTitle"[^>]*content=")[^"]*(")/i, '$1' + escapeHtml(title) + '$2');
    html = html.replace(/(<meta\\s+id="seoOgDescription"[^>]*content=")[^"]*(")/i, '$1' + escapeHtml(description) + '$2');
    html = html.replace(/(<meta\\s+id="seoOgUrl"[^>]*content=")[^"]*(")/i, '$1' + SITE + '/imovel/' + encodeURIComponent(slug) + '$2');
    html = html.replace(/(<meta\\s+id="seoOgImage"[^>]*content=")[^"]*(")/i, '$1' + escapeHtml(photo) + '$2');
    if (/<meta\\s+property="og:image:width"/i.test(html)) {
      html = html.replace(/(<meta\\s+property="og:image:width"[^>]*content=")[^"]*(")/i, '$11200$2');
    } else {
      html = html.replace('</head>', '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="' + escapeHtml(photo) + '"></head>');
    }
    html = setMeta(html, 'twitter:image', photo);
    html = html.replace('</head>', '<meta property="og:type" content="product"></head>');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).send(html);
  } catch (error) {
    console.error('[VSN property share]', error);
    return res.redirect(302, SITE + '/imovel.html' + (req.query?.slug ? '?slug=' + encodeURIComponent(String(req.query.slug)) : ''));
  }
}
