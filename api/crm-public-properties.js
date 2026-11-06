/**
 * Public property feed scoped to one active VersusCRM company.
 * The tenant is selected by a server-verified company UUID, never by an
 * untrusted company_id query supplied directly to the database.
 */
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }
  if (!SUPABASE_URL || !SERVER_KEY) {
    return res.status(503).json({ ok: false, error: 'Catálogo indisponível.' });
  }

  const companyId = String(req.query?.company_id || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(companyId)) {
    return res.status(400).json({ ok: false, error: 'Empresa inválida.' });
  }

  try {
    const companyQuery = new URLSearchParams({
      select: 'id',
      id: 'eq.' + companyId,
      status: 'eq.active',
      limit: '1'
    });
    const companyResponse = await fetch(SUPABASE_URL + '/rest/v1/crm_companies?' + companyQuery, {
      headers: { apikey: SERVER_KEY, Authorization: 'Bearer ' + SERVER_KEY, Accept: 'application/json' }
    });
    if (!companyResponse.ok) throw new Error('Falha ao validar empresa');
    const companies = await companyResponse.json();
    if (!Array.isArray(companies) || companies.length !== 1) {
      return res.status(404).json({ ok: false, error: 'Empresa indisponível.' });
    }

    const propertyQuery = new URLSearchParams({
      select: 'id,code,title,transaction_type,property_type,price,rent_price,area,bedrooms,bathrooms,parking,neighborhood,city,address,condominium_name,photos,photo_thumbnails,for_sale,for_rent,published,featured,created_at',
      company_id: 'eq.' + companyId,
      published: 'eq.true',
      order: 'created_at.desc',
      limit: '200'
    });
    const response = await fetch(SUPABASE_URL + '/rest/v1/properties?' + propertyQuery, {
      headers: { apikey: SERVER_KEY, Authorization: 'Bearer ' + SERVER_KEY, Accept: 'application/json' }
    });
    if (!response.ok) throw new Error('Falha ao consultar imóveis');
    const properties = await response.json();
    return res.status(200).json({ ok: true, properties: Array.isArray(properties) ? properties : [] });
  } catch (error) {
    console.error('[crm-public-properties] Erro:', error?.message || 'desconhecido');
    return res.status(502).json({ ok: false, error: 'Não foi possível carregar os imóveis.' });
  }
}
