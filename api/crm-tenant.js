/**
 * VersusCRM — resolução pública de tenant.
 *
 * Isolado das APIs existentes da VSN. Não usa nem altera o Supabase legado.
 * Configure no projeto Vercel de integração:
 *   CRM_SUPABASE_URL=https://<projeto-blue-dog>.supabase.co
 *   CRM_SUPABASE_ANON_KEY=<chave publicável do projeto Blue Dog>
 *
 * O RPC public.get_public_crm_company(p_slug) deve retornar apenas dados públicos
 * de uma empresa ativa (id, name, slug, logo_url, primary_color, status).
 */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function safeText(value, max = 160) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function safeColor(value) {
  const color = safeText(value, 20);
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color : '#d3aa62';
}

function safeLogo(value) {
  const logo = safeText(value, 1000);
  try {
    const url = new URL(logo);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const slug = safeText(req.query?.slug, 63).toLowerCase();
  if (!SLUG_RE.test(slug)) {
    return res.status(400).json({ error: 'Identificador da imobiliária inválido' });
  }

  const baseUrl = (process.env.CRM_SUPABASE_URL || '').replace(/\/+$/, '');
  const publicKey = process.env.CRM_SUPABASE_ANON_KEY || process.env.CRM_SUPABASE_PUBLISHABLE_KEY;

  if (!baseUrl || !publicKey) {
    console.error('[crm-tenant] Configure CRM_SUPABASE_URL e CRM_SUPABASE_ANON_KEY no ambiente de integração.');
    return res.status(503).json({ error: 'Resolução de imobiliárias ainda não configurada' });
  }

  try {
    const response = await fetch(baseUrl + '/rest/v1/rpc/get_public_crm_company', {
      method: 'POST',
      headers: {
        apikey: publicKey,
        Authorization: 'Bearer ' + publicKey,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ p_slug: slug })
    });

    if (response.status === 404 || response.status === 406) {
      console.error('[crm-tenant] RPC get_public_crm_company não encontrado ou com retorno incompatível.');
      return res.status(503).json({ error: 'Resolução de imobiliárias indisponível' });
    }
    if (!response.ok) {
      console.error('[crm-tenant] Supabase RPC respondeu HTTP', response.status);
      return res.status(502).json({ error: 'Não foi possível consultar a imobiliária' });
    }

    const payload = await response.json();
    const company = Array.isArray(payload) ? payload[0] : payload;
    if (!company || company.status !== 'active' || company.slug !== slug || !company.id) {
      return res.status(404).json({ error: 'Imobiliária não encontrada ou indisponível' });
    }

    return res.status(200).json({
      id: String(company.id),
      name: safeText(company.name) || 'Imobiliária',
      slug,
      logo_url: safeLogo(company.logo_url),
      primary_color: safeColor(company.primary_color)
    });
  } catch (error) {
    console.error('[crm-tenant] Falha na resolução:', error?.message || 'erro desconhecido');
    return res.status(502).json({ error: 'Falha ao consultar a imobiliária' });
  }
}
