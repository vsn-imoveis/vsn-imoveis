export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

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
  if (!serviceKey || !brevoKey || !from) {
    console.error('Faltam SUPABASE_SERVICE_ROLE_KEY, BREVO_EMAIL_API ou BREVO_FROM_EMAIL.');
    return res.status(500).json({ error: 'Cadastro não configurado: confira as chaves do Supabase e do Brevo e o remetente verificado (BREVO_FROM_EMAIL) na Vercel.' });
  }

  const password = 'VSN' + digits.slice(-4);
  const supabaseUrl = process.env.SUPABASE_URL || 'https://jpdfynaioepcmgqlqlht.supabase.co';
  let userId;

  try {
    const created = await fetch(supabaseUrl + '/auth/v1/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: 'Bearer ' + serviceKey
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: nome, phone: celular, user_type: 'proprietario' }
      })
    });
    const createdBody = await created.json().catch(() => ({}));
    if (!created.ok) {
      const msg = createdBody.msg || createdBody.message || createdBody.error_description || createdBody.error;
      if (created.status === 422 || /already|registered|exists/i.test(String(msg || ''))) {
        return res.status(409).json({ error: 'Este e-mail já possui cadastro. Entre com sua senha ou use “Esqueci minha senha”.' });
      }
      console.error('Supabase admin create user:', created.status, createdBody);
      return res.status(502).json({ error: 'Não foi possível criar a conta no momento.' });
    }
    userId = createdBody.id;

    const mailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': brevoKey, accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: 'VSN Imóveis', email: from },
        to: [{ email, name: nome }],
        subject: 'Sua senha de acesso – VSN Imóveis',
        textContent: `Olá, ${nome}!\n\nSeu cadastro na Área do Proprietário da VSN Imóveis foi realizado.\n\nSua senha de acesso é: ${password}\n\nAcesse sua conta pelo link abaixo:\nhttps://vsn-imoveis.vercel.app/proprietario/\n\nEntre com seu e-mail cadastrado e a senha informada acima.\n\nAtenciosamente,\nEquipe VSN Imóveis`
      })
    });
    const mailBody = await mailResponse.json().catch(() => ({}));
    if (!mailResponse.ok) {
      console.error('Brevo proprietor email:', mailResponse.status, mailBody);
      if (userId) {
        await fetch(supabaseUrl + '/auth/v1/admin/users/' + encodeURIComponent(userId), {
          method: 'DELETE',
          headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey }
        }).catch(() => {});
      }
      return res.status(502).json({ error: 'A conta não pôde ser concluída porque o e-mail não foi enviado. Confira o remetente do Brevo e tente novamente.' });
    }

    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Proprietor signup error:', error);
    if (userId) {
      await fetch(supabaseUrl + '/auth/v1/admin/users/' + encodeURIComponent(userId), {
        method: 'DELETE',
        headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey }
      }).catch(() => {});
    }
    return res.status(500).json({ error: 'Falha ao concluir o cadastro. Tente novamente.' });
  }
}
