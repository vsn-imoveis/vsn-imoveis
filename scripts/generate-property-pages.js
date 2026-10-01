const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://jpdfynaioepcmgqlqlht.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bDiXCzTT1gXO_xbVGhnAXg_Muy4lx03';
const SITE_URL = 'https://vsn-imoveis.vercel.app';

function seoSlugPart(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' e ').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').replace(/-+/g, '-').slice(0, 70).replace(/-+$/, '');
}

function propertySlug(p) {
  const condo = seoSlugPart(p.condominium_name || '');
  const rua = seoSlugPart(p.address || '');
  const dorms = Number(p.bedrooms || 0);
  const area = Number(p.area || 0);
  const type = (p.for_rent && !p.for_sale) ? 'locacao'
    : (p.for_sale && !p.for_rent) ? 'venda'
    : (p.transaction_type === 'rent' ? 'locacao'
    : p.transaction_type === 'sale' ? 'venda' : 'imovel');
  return [condo, rua, dorms ? dorms + '-dorm' : null, area ? Math.round(area) + 'm2' : null, type]
    .filter(Boolean).join('-');
}

function escAttr(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function brl(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function fetchPublished() {
  const fields = 'id,code,title,description,photos,property_type,transaction_type,for_sale,for_rent,price,rent_price,area,bedrooms,neighborhood,city,state,condominium_name,address';
  const url = SUPABASE_URL + '/rest/v1/properties?select=' + encodeURIComponent(fields) + '&published=eq.true&order=created_at.desc';
  const r = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } });
  if (!r.ok) throw new Error('Supabase retornou HTTP ' + r.status);
  return r.json();
}

function makePage(template, p) {
  const slug = propertySlug(p);
  const url = SITE_URL + '/imovel/' + slug;
  const photos = Array.isArray(p.photos) ? p.photos.filter(Boolean) : [];
  const type = p.property_type || 'Imóvel';
  const city = p.city || 'São Paulo';
  const neighborhood = p.neighborhood || '';
  const titleBase = p.title || (type + (neighborhood ? ' em ' + neighborhood : ' em ' + city));
  const title = (titleBase + ' | VSN Imóveis').slice(0, 70);
  const description = [
    p.title || type,
    neighborhood ? 'no bairro ' + neighborhood : '',
    city ? 'em ' + city : '',
    p.condominium_name ? 'Condomínio ' + p.condominium_name : '',
    p.area ? Number(p.area).toLocaleString('pt-BR') + ' m²' : '',
    p.bedrooms ? p.bedrooms + ' ' + (Number(p.bedrooms) === 1 ? 'quarto' : 'quartos') : '',
    p.for_rent && p.rent_price ? brl(p.rent_price) + '/mês' : '',
    p.for_sale && p.price ? brl(p.price) : ''
  ].filter(Boolean).join(' · ').slice(0, 155);

  let html = template;
  html = html.replace(/<title>[^<]*<\/title>/i, '<title>' + escAttr(title) + '</title>');
  html = html.replace(/(<meta id="seoDescription"[^>]*content=")[^"]*(")/i, '$1' + escAttr(description) + '$2');
  html = html.replace(/(<link id="seoCanonical"[^>]*href=")[^"]*(")/i, '$1' + escAttr(url) + '$2');
  html = html.replace(/(<meta id="seoOgTitle"[^>]*content=")[^"]*(")/i, '$1' + escAttr(title) + '$2');
  html = html.replace(/(<meta id="seoOgDescription"[^>]*content=")[^"]*(")/i, '$1' + escAttr(description) + '$2');
  html = html.replace(/(<meta id="seoOgUrl"[^>]*content=")[^"]*(")/i, '$1' + escAttr(url) + '$2');
  html = html.replace(/(<meta id="seoOgImage"[^>]*content=")[^"]*(")/i, '$1' + escAttr(photos[0] || SITE_URL + '/hero-v12.jpg') + '$2');
  return { slug, html };
}

async function main() {
  const template = fs.readFileSync(path.join(process.cwd(), 'imovel.html'), 'utf8');
  const properties = await fetchPublished();
  const dir = path.join(process.cwd(), 'imovel');
  fs.mkdirSync(dir, { recursive: true });

  const expected = new Set();
  for (const p of properties) {
    const { slug, html } = makePage(template, p);
    if (!slug) continue;
    expected.add(slug + '.html');
    fs.writeFileSync(path.join(dir, slug + '.html'), html);
  }

  // Remove generated pages for properties that are no longer published.
  for (const name of fs.readdirSync(dir)) {
    if (name.endsWith('.html') && !expected.has(name)) {
      fs.unlinkSync(path.join(dir, name));
    }
  }

  console.log('Static property pages generated:', expected.size);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
