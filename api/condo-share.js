const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jpdfynaioepcmgqlqlht.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_bDiXCzTT1gXO_xbVGhnAXg_Muy4lx03';
const SITE = 'https://vsn-imoveis.vercel.app';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export default async function handler(req, res) {
  try {
    const slug = String(req.query?.slug || '').trim();
    if (!slug) return res.status(400).send('Slug do condomínio não informado.');

    const response = await fetch(SUPABASE_URL + '/rest/v1/condominiums?select=name,address,number,neighborhood,city,state,cover_image_url,page_slug,page_published&page_slug=eq.' + encodeURIComponent(slug) + '&page_published=eq.true&limit=1', {
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, Accept: 'application/json' }
    });
    if (!response.ok) throw new Error('Supabase HTTP ' + response.status);
    const rows = await response.json();
    const condo = Array.isArray(rows) ? rows[0] : null;
    if (!condo) {
      res.setHeader('Cache-Control', 'no-store');
      return res.redirect(302, SITE + '/condominio.html?slug=' + encodeURIComponent(slug));
    }

    const page = await fetch(SITE + '/condominio.html', { headers: { Accept: 'text/html' } });
    if (!page.ok) throw new Error('Não foi possível carregar a página-base do condomínio.');
    let html = await page.text();

    const name = condo.name || 'Condomínio';
    const title = name + ' | VSN Imóveis';
    const address = [condo.address, condo.number, condo.neighborhood, condo.city, condo.state].filter(Boolean).join(', ');
    const description = 'Veja fotos, localização, características e imóveis disponíveis no condomínio ' + name + (address ? ', ' + address : '') + ' na VSN Imóveis.';
    const canonical = SITE + '/condominio/' + encodeURIComponent(condo.page_slug || slug);
    const image = typeof condo.cover_image_url === 'string' && /^https?:\/\//i.test(condo.cover_image_url) ? condo.cover_image_url : SITE + '/api/site-share-image';

    html = html.replace(/<title[^>]*>[^<]*<\/title>/i, '<title>' + escapeHtml(title) + '</title>');
    html = html.replace(/(<meta\s+id="seoDescription"[^>]*content=")[^"]*(")/i, '$1' + escapeHtml(description) + '$2');
    html = html.replace(/(<link\s+id="seoCanonical"[^>]*href=")[^"]*(")/i, '$1' + escapeHtml(canonical) + '$2');
    html = html.replace(/(<meta\s+id="seoOgTitle"[^>]*content=")[^"]*(")/i, '$1' + escapeHtml(title) + '$2');
    html = html.replace(/(<meta\s+id="seoOgDescription"[^>]*content=")[^"]*(")/i, '$1' + escapeHtml(description) + '$2');
    html = html.replace(/(<meta\s+id="seoOgUrl"[^>]*content=")[^"]*(")/i, '$1' + escapeHtml(canonical) + '$2');
    html = html.replace(/(<meta\s+id="seoOgImage"[^>]*content=")[^"]*(")/i, '$1' + escapeHtml(image) + '$2');
    html = html.replace('</head>', '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="' + escapeHtml(title) + '"><meta name="twitter:description" content="' + escapeHtml(description) + '"><meta name="twitter:image" content="' + escapeHtml(image) + '"></head>');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).send(html);
  } catch (error) {
    console.error('[VSN condominium share]', error);
    return res.redirect(302, SITE + '/condominio.html' + (req.query?.slug ? '?slug=' + encodeURIComponent(String(req.query.slug)) : ''));
  }
}
