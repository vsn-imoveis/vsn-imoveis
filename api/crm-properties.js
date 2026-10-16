/**
 * Create a property for the authenticated CRM tenant.
 *
 * Uses only the dedicated CRM Supabase project. The company_id is derived
 * from the authenticated user's crm_memberships record, never trusted from
 * the request body. RLS remains the final authorization layer.
 */
const FIELDS = [
  'title', 'description', 'property_type', 'transaction_type',
  'address', 'neighborhood', 'city', 'state', 'zip_code',
  'price', 'rent_price', 'area', 'bedrooms', 'bathrooms',
  'parking_spaces', 'photos', 'published'
];

function json(res, status, body) {
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Método não permitido' });
  }

  const baseUrl = (process.env.CRM_SUPABASE_URL || '').replace(/\/+$/, '');
  const publicKey = process.env.CRM_SUPABASE_ANON_KEY || process.env.CRM_SUPABASE_PUBLISHABLE_KEY;
  if (!baseUrl || !publicKey) {
    console.error('[crm-properties] Ambiente do CRM não configurado.');
    return json(res, 503, { error: 'Cadastro do CRM ainda não está configurado' });
  }

  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return json(res, 401, { error: 'Faça login para cadastrar um imóvel' });
  const userToken = match[1];

  try {
    const userResponse = await fetch(baseUrl + '/auth/v1/user', {
      headers: { apikey: publicKey, Authorization: 'Bearer ' + userToken }
    });
    if (!userResponse.ok) return json(res, 401, { error: 'Sessão inválida ou expirada' });
    const user = await userResponse.json();
    if (!user?.id) return json(res, 401, { error: 'Sessão inválida' });

    const membershipResponse = await fetch(
      baseUrl + '/rest/v1/crm_memberships?select=company_id&user_id=eq.' +
        encodeURIComponent(user.id) + '&limit=2',
      { headers: { apikey: publicKey, Authorization: 'Bearer ' + userToken, Accept: 'application/json' } }
    );
    if (!membershipResponse.ok) {
      console.error('[crm-properties] Não foi possível verificar associação; HTTP', membershipResponse.status);
      return json(res, 403, { error: 'Não foi possível confirmar a imobiliária deste usuário' });
    }
    const memberships = await membershipResponse.json();
    if (!Array.isArray(memberships) || memberships.length !== 1 || !memberships[0]?.company_id) {
      return json(res, 403, { error: 'Usuário sem uma única imobiliária vinculada' });
    }
    const companyId = memberships[0].company_id;

    const input = req.body && typeof req.body === 'object' ? req.body : {};
    const record = {};
    for (const field of FIELDS) {
      if (Object.prototype.hasOwnProperty.call(input, field)) record[field] = input[field];
    }
    if (!String(record.title || '').trim()) {
      return json(res, 400, { error: 'Informe o título do imóvel' });
    }
    if (record.photos !== undefined && (!Array.isArray(record.photos) || record.photos.length > 35)) {
      return json(res, 400, { error: 'O imóvel pode conter no máximo 35 fotos' });
    }
    for (const key of ['price', 'rent_price', 'area', 'bedrooms', 'bathrooms', 'parking_spaces']) {
      if (record[key] !== undefined && record[key] !== null &&
          (!Number.isFinite(Number(record[key])) || Number(record[key]) < 0)) {
        return json(res, 400, { error: 'Valor inválido no campo ' + key });
      }
    }

    // Never accept a tenant/company identifier supplied by the browser.
    record.company_id = companyId;

    const insertResponse = await fetch(baseUrl + '/rest/v1/properties?select=*', {
      method: 'POST',
      headers: {
        apikey: publicKey,
        Authorization: 'Bearer ' + userToken,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(record)
    });

    if (insertResponse.status === 401 || insertResponse.status === 403) {
      return json(res, 403, { error: 'O banco recusou o cadastro. Verifique as políticas de acesso do CRM.' });
    }
    if (!insertResponse.ok) {
      // Avoid returning raw database errors, which may disclose schema details.
      console.error('[crm-properties] Insert falhou; HTTP', insertResponse.status);
      return json(res, 400, { error: 'Não foi possível cadastrar. Confirme se a migração de isolamento e os campos do cadastro foram aplicados no banco CRM.' });
    }

    const rows = await insertResponse.json();
    const created = Array.isArray(rows) ? rows[0] : rows;
    if (!created?.id || created.company_id !== companyId) {
      console.error('[crm-properties] Resposta de cadastro inesperada.');
      return json(res, 502, { error: 'O banco não confirmou o imóvel criado' });
    }
    return json(res, 201, { property: created });
  } catch (error) {
    console.error('[crm-properties] Erro inesperado:', error?.message || 'desconhecido');
    return json(res, 502, { error: 'Falha ao cadastrar imóvel no CRM' });
  }
}
