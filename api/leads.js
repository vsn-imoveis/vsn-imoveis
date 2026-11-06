const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

function getHost(req) {
  const raw = req.headers['x-forwarded-host'] || req.headers.host || '';
  return String(Array.isArray(raw) ? raw[0] : raw).split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVER_KEY,
      Authorization: 'Bearer ' + SUPABASE_SERVER_KEY,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    console.error('[CRM leads] Supabase request failed:', response.status, data);
    throw new Error('Falha ao registrar o contato.');
  }
  return data;
}

async function resolveCompany(req) {
  // Dedicated deployments may define a company slug. Shared hosting must
  // resolve the tenant strictly through an active hostname mapping.
  const configuredSlug = String(process.env.CRM_COMPANY_SLUG || '').trim().toLowerCase();

  if (!configuredSlug) {
    const hostname = getHost(req);
    if (!hostname) return null;
    const domains = await supabaseRequest(
      'crm_domains?select=company_id&hostname=eq.' + encodeURIComponent(hostname) + '&status=eq.active&limit=1'
    );
    const companyId = Array.isArray(domains) ? domains[0]?.company_id : null;
    if (!companyId) return null;
    const companies = await supabaseRequest(
      'crm_companies?select=id,slug,name,status&id=eq.' + encodeURIComponent(companyId) + '&status=eq.active&limit=1'
    );
    return Array.isArray(companies) ? companies[0] || null : null;
  }

  const companies = await supabaseRequest(
    'crm_companies?select=id,slug,name,status&slug=eq.' + encodeURIComponent(configuredSlug) + '&status=eq.active&limit=1'
  );
  return Array.isArray(companies) ? companies[0] || null : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVER_KEY) {
    console.error('[CRM leads] Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server only).');
    return res.status(500).json({ ok: false, error: 'Captação temporariamente indisponível.' });
  }

  try {
    const body = req.body || {};
    const nome = String(body.nome || '').trim();
    const whatsapp = String(body.whatsapp || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const interesse = String(body.interesse || '').trim();
    const imovel = String(body.imovel || '').trim();
    const mensagem = String(body.mensagem || '').trim();

    if (!nome || !whatsapp || !email) {
      return res.status(400).json({ ok: false, error: 'Informe nome, WhatsApp e e-mail.' });
    }
    if (nome.length > 160 || whatsapp.length > 40 || email.length > 254 ||
        interesse.length > 120 || imovel.length > 500 || mensagem.length > 4000) {
      return res.status(400).json({ ok: false, error: 'Os dados enviados excedem o limite permitido.' });
    }

    const company = await resolveCompany(req);
    if (!company) {
      return res.status(404).json({ ok: false, error: 'Não foi possível identificar uma empresa ativa para este site.' });
    }

    const combinedMessage = [imovel ? 'Região / imóvel: ' + imovel : '', mensagem]
      .filter(Boolean).join('\n\n') || null;

    const saved = await supabaseRequest('crm_leads?select=id', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        company_id: company.id,
        contact_name: nome,
        phone: whatsapp,
        email,
        interest: interesse || null,
        message: combinedMessage,
        status: 'new',
        source: 'site',
        source_url: getHost(req) ? 'https://' + getHost(req) : null
      })
    });

    const leadId = Array.isArray(saved) ? saved[0]?.id || null : null;
    return res.status(200).json({ ok: true, leadId });
  } catch (error) {
    console.error('[CRM leads] Lead API error:', error);
    return res.status(500).json({ ok: false, error: 'Não foi possível registrar seu contato.' });
  }
}
