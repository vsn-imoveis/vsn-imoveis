export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return res.status(401).json({ error: 'Sessão administrativa não identificada. Entre novamente.' });

  const nome = String(req.body?.nome || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const celular = String(req.body?.celular || '').trim();
  const digits = celular.replace(/\D/g, '');
  if (!nome || !email || digits.length < 4) {
    return res.status(400).json({ error: 'Informe nome, e-mail e um celular válido.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Informe um e-mail válido.' });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const brevoKey = process.env.BREVO_EMAIL_API;
  const from = process.env.BREVO_FROM_EMAIL;
  const supabaseUrl = process.env.SUPABASE_URL || 'https://jpdfynaioepcmgqlqlht.supabase.co';
  if (!serviceKey) {
    console.error('Falta SUPABASE_SERVICE_ROLE_KEY.');
    return res.status(500).json({ error: 'Cadastro não configurado. Confira a chave do Supabase na Vercel.' });
  }

  const headers = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey };
  const sendAccessEmail = async (password) => {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': brevoKey, accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: 'VSN Imóveis', email: from },
        to: [{ email, name: nome }],
        subject: 'Seu acesso à Área do Proprietário – VSN Imóveis',
        textContent: `Olá, ${nome}!\n\nSeu acesso à Área do Proprietário da VSN Imóveis está disponível.\n\nLogin: ${email}\nSenha: ${password}\n\nAcesse: https://vsn-imoveis.vercel.app/proprietario/\n\nPor segurança, recomendamos alterar a senha após o primeiro acesso.\n\nAtenciosamente,\nEquipe VSN Imóveis`
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Brevo proprietor access email:', response.status, body);
      throw new Error('A conta foi preparada, mas o e-mail não foi enviado. Confira o remetente e a configuração do Brevo.');
    }
  };

  let createdUserId = '';
  try {
    // Confirma a sessão e exige perfil administrativo antes de criar ou redefinir acesso.
    const callerResponse = await fetch(supabaseUrl + '/auth/v1/user', {
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + token }
    });
    const caller = await callerResponse.json().catch(() => ({}));
    if (!callerResponse.ok || !caller.id) {
      return res.status(401).json({ error: 'Sessão inválida ou expirada. Entre novamente.' });
    }

    const adminResponse = await fetch(
      supabaseUrl + '/rest/v1/profiles?id=eq.' + encodeURIComponent(caller.id) + '&select=role&limit=1',
      { headers }
    );
    const adminProfiles = await adminResponse.json().catch(() => []);
    const adminRole = String(Array.isArray(adminProfiles) ? adminProfiles[0]?.role || '' : '').toLowerCase();
    if (!adminResponse.ok || adminRole !== 'admin') {
      return res.status(403).json({ error: 'Somente um administrador pode enviar os dados de acesso.' });
    }

    if (!brevoKey || !from) {
      console.error('Faltam BREVO_EMAIL_API ou BREVO_FROM_EMAIL.');
      return res.status(500).json({ error: 'Envio de e-mail não configurado. Confira as chaves do Brevo na Vercel.' });
    }

    const password = 'VSN' + digits.slice(-4);
    const usersResponse = await fetch(supabaseUrl + '/auth/v1/admin/users?page=1&per_page=1000', { headers });
    const usersBody = await usersResponse.json().catch(() => ({}));
    const users = Array.isArray(usersBody) ? usersBody : (usersBody.users || []);
    if (!usersResponse.ok) {
      console.error('Supabase users lookup:', usersResponse.status, usersBody);
      return res.status(502).json({ error: 'Não foi possível consultar as contas cadastradas.' });
    }

    let owner = users.find(user => String(user.email || '').toLowerCase() === email);
    if (owner) {
      const profileResponse = await fetch(
        supabaseUrl + '/rest/v1/profiles?id=eq.' + encodeURIComponent(owner.id) + '&select=id,user_type,role&limit=1',
        { headers }
      );
      const profiles = await profileResponse.json().catch(() => []);
      const profile = Array.isArray(profiles) ? profiles[0] : null;
      if (!profileResponse.ok) {
        console.error('Supabase owner profile lookup:', profileResponse.status, profiles);
        return res.status(502).json({ error: 'Não foi possível verificar o perfil da conta existente.' });
      }
      const ownerType = String(profile?.role || profile?.user_type || owner.user_metadata?.user_type || '').toLowerCase();
      if (!['proprietario', 'proprietário'].includes(ownerType)) {
        return res.status(409).json({ error: 'Este e-mail já está associado a uma conta que não é de proprietário. Use outro e-mail ou confira o cadastro existente.' });
      }

      // Conta de proprietário existente: não alterar senha/dados nem reenviar e-mail.
      // Retorna o mesmo ID para permitir vincular essa conta a vários imóveis.
      return res.status(200).json({ ok: true, userId: owner.id, reused: true });
    }

    const created = await fetch(supabaseUrl + '/auth/v1/admin/users', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email, password, email_confirm: true,
        user_metadata: { full_name: nome, phone: celular, user_type: 'proprietario' }
      })
    });
    const createdBody = await created.json().catch(() => ({}));
    if (!created.ok) {
      console.error('Supabase admin create user:', created.status, createdBody);
      return res.status(502).json({ error: 'Não foi possível criar a conta do proprietário.' });
    }
    createdUserId = createdBody.id;

    const profileResponse = await fetch(supabaseUrl + '/rest/v1/profiles', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ id: createdUserId, user_type: 'proprietario', role: 'proprietario', full_name: nome, phone: celular })
    });
    if (!profileResponse.ok) {
      console.error('Supabase profile upsert:', profileResponse.status, await profileResponse.text().catch(() => ''));
      await fetch(supabaseUrl + '/auth/v1/admin/users/' + encodeURIComponent(createdUserId), { method: 'DELETE', headers }).catch(() => {});
      return res.status(502).json({ error: 'Não foi possível criar o perfil do proprietário.' });
    }

    try {
      await sendAccessEmail(password);
    } catch (mailError) {
      await fetch(supabaseUrl + '/auth/v1/admin/users/' + encodeURIComponent(createdUserId), { method: 'DELETE', headers }).catch(() => {});
      return res.status(502).json({ error: mailError.message });
    }
    return res.status(201).json({ ok: true, userId: createdUserId });
  } catch (error) {
    console.error('Proprietor signup/access error:', error);
    return res.status(500).json({ error: error.message || 'Falha ao concluir o cadastro. Tente novamente.' });
  }
}
