/**
 * VersusCRM — resolução pública de empresa por slug.
 * Usa somente o Supabase Versus configurado no servidor.
 * A chave privilegiada nunca é enviada ao navegador.
 */
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function send(res, status, body) {
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { ok: false, error: 'Método não permitido.' });
  }

  if (!SUPABASE_URL || !SERVER_KEY) {
    console.error('[crm-tenant] Configuração server-side do Supabase ausente.');
    return send(res, 503, { ok: false, error: 'Resolução de imobiliárias indisponível.' });
  }

  const rawSlug = Array.isArray(req.query?.slug) ? req.query.slug[0] : req.query?.slug;
  const slug = String(rawSlug || '').trim().toLowerCase();
  if (!SLUG_RE.test(slug)) {
    return send(res, 400, { ok: false, error: 'Identificador da imobiliária inválido.' });
  }

  try {
    const query = new URLSearchParams({
      select: 'id,name,slug,status,logo_url,primary_color,instagram_url,facebook_url,youtube_url,public_address,about_text,site_photo_url,site_cover_url,site_share_image_url',
      slug: 'eq.' + slug,
      status: 'eq.active',
      limit: '2'
    });
    const response = await fetch(SUPABASE_URL + '/rest/v1/crm_companies?' + query.toString(), {
      headers: {
        apikey: SERVER_KEY,
        Authorization: 'Bearer ' + SERVER_KEY,
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      console.error('[crm-tenant] Consulta Supabase falhou; HTTP', response.status);
      return send(res, 502, { ok: false, error: 'Não foi possível consultar a imobiliária.' });
    }

    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length !== 1) {
      return send(res, 404, { ok: false, error: 'Imobiliária não encontrada ou indisponível.' });
    }

    const company = rows[0];
    return send(res, 200, {
      ok: true,
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        logo_url: company.logo_url || null,
        primary_color: company.primary_color || null,
        instagram_url: company.instagram_url || null,
        facebook_url: company.facebook_url || null,
        youtube_url: company.youtube_url || null,
        public_address: company.public_address || null,
        about_text: company.about_text || null,
        site_photo_url: company.site_photo_url || null,
        site_cover_url: company.site_cover_url || null,
        site_share_image_url: company.site_share_image_url || null
      }
    });
  } catch (error) {
    console.error('[crm-tenant] Erro inesperado:', error?.message || 'desconhecido');
    return send(res, 502, { ok: false, error: 'Falha ao consultar a imobiliária.' });
  }
}
