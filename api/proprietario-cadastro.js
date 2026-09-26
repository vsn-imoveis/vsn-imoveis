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
  const action = String(req.body?.action || 'create').toLowerCase();
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
        supabaseUrl + '/rest/v1/profiles?id=eq.' + encodeURIComponent(owner.id) + '&select=id,role&limit=1',
        { headers }
      );
      const profiles = await profileResponse.json().catch(() => []);
      const profile = Array.isArray(profiles) ? profiles[0] : null;
      if (!profileResponse.ok) {
        console.error('Supabase owner profile lookup:', profileResponse.status, profiles);
        return res.status(502).json({ error: 'Não foi possível verificar o perfil da conta existente.' });
      }
      const ownerType = String(profile?.role || '').toLowerCase();
      if (!['proprietario', 'proprietário'].includes(ownerType)) {
        return res.status(409).json({ error: 'Este e-mail já está associado a uma conta que não é de proprietário. Use outro e-mail ou confira o cadastro existente.' });
      }

      // Conta já existente antes do cadastro: não altera conta nem dispara e-mail.
      if (owner.user_metadata?.owner_access_email_pending !== true) {
        return res.status(200).json({ ok: true, userId: owner.id, reused: true, sent: false });
      }

      // A conta foi criada pelo cadastro do imóvel e aguarda o envio manual pelo botão.
      if (action !== 'send_access') {
        return res.status(200).json({ ok: true, userId: owner.id, reused: true, pendingEmail: true, sent: false });
      }
      if (!brevoKey || !from) {
        return res.status(500).json({ error: 'Envio de e-mail não configurado. Confira as chaves do Brevo na Vercel.' });
      }
      const pendingPassword = 'VSN' + digits.slice(-4);
      await sendAccessEmail(pendingPassword);
      const metadataUpdate = await fetch(supabaseUrl + '/auth/v1/admin/users/' + encodeURIComponent(owner.id), {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_metadata: { ...(owner.user_metadata || {}), owner_access_email_pending: false } })
      });
      if (!metadataUpdate.ok) {
        console.error('Could not clear owner email pending flag:', metadataUpdate.status, await metadataUpdate.text().catch(() => ''));
      }
      return res.status(200).json({ ok: true, userId: owner.id, reused: true, sent: true });
    }

    if (action === 'send_access') {
      return res.status(404).json({ error: 'Conta de proprietário ainda não foi criada. Salve o imóvel antes de enviar o acesso.' });
    }

    const created = await fetch(supabaseUrl + '/auth/v1/admin/users', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email, password, email_confirm: true,
        user_metadata: { full_name: nome, phone: celular, owner_access_email_pending: true }
      })
    });
    const createdBody = await created.json().catch(() => ({}));
    if (!created.ok) {
      console.error('Supabase admin create user:', created.status, createdBody);
      return res.status(502).json({ error: 'Não foi possível criar a conta do proprietário.' });
    }
    createdUserId = createdBody.id;

    // O gatilho de auth.users já cria um perfil básico. Removemos somente esse perfil
    // recém-criado e inserimos o perfil definitivo para evitar ON CONFLICT DO UPDATE,
    // que é bloqueado pela proteção de role.
    const removeDefaultProfile = await fetch(
      supabaseUrl + '/rest/v1/profiles?id=eq.' + encodeURIComponent(createdUserId),
      { method: 'DELETE', headers }
    );
    if (!removeDefaultProfile.ok) {
      console.error('Supabase default profile cleanup:', removeDefaultProfile.status, await removeDefaultProfile.text().catch(() => ''));
      await fetch(supabaseUrl + '/auth/v1/admin/users/' + encodeURIComponent(createdUserId), { method: 'DELETE', headers }).catch(() => {});
      return res.status(502).json({ error: 'Não foi possível preparar o perfil do proprietário.' });
    }

    const profileResponse = await fetch(supabaseUrl + '/rest/v1/profiles', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ id: createdUserId, role: 'proprietario', full_name: nome, phone: celular })
    });
    if (!profileResponse.ok) {
      console.error('Supabase profile insert:', profileResponse.status, await profileResponse.text().catch(() => ''));
      await fetch(supabaseUrl + '/auth/v1/admin/users/' + encodeURIComponent(createdUserId), { method: 'DELETE', headers }).catch(() => {});
      return res.status(502).json({ error: 'Não foi possível criar o perfil do proprietário.' });
    }

    // O cadastro do imóvel não envia e-mail automaticamente. O botão fará o envio depois.
    return res.status(201).json({ ok: true, userId: createdUserId, pendingEmail: true, sent: false });
  } catch (error) {
    console.error('Proprietor signup/access error:', error);
    return res.status(500).json({ error: error.message || 'Falha ao concluir o cadastro. Tente novamente.' });
  }
}
