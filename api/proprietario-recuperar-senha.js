import { Resend } from 'resend';
import { randomBytes } from 'node:crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Informe um e-mail válido.' });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!serviceKey || !resendKey) {
    console.error('Faltam SUPABASE_SERVICE_ROLE_KEY ou RESEND_API_KEY.');
    return res.status(500).json({ error: 'O serviço de recuperação ainda não está configurado.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || 'https://jpdfynaioepcmgqlqlht.supabase.co';
  const from = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  const headers = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey };

  try {
    let user = null;
    // Percorre a listagem paginada até encontrar a conta pelo e-mail.
    for (let page = 1; page <= 20 && !user; page++) {
      const response = await fetch(supabaseUrl + '/auth/v1/admin/users?page=' + page + '&per_page=1000', { headers });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error('Supabase admin list users:', response.status, body);
        return res.status(502).json({ error: 'Não foi possível processar a recuperação agora.' });
      }
      const users = Array.isArray(body.users) ? body.users : [];
      user = users.find(item => String(item.email || '').toLowerCase() === email) || null;
      if (users.length < 1000) break;
    }

    // A mesma resposta é usada para contas existentes e inexistentes.
    const genericMessage = 'Se o e-mail estiver cadastrado, você receberá uma nova senha.';
    if (!user || user.user_metadata?.user_type !== 'proprietario') {
      return res.status(200).json({ ok: true, message: genericMessage });
    }

    const password = 'VSN-' + randomBytes(9).toString('hex');
    const update = await fetch(supabaseUrl + '/auth/v1/admin/users/' + encodeURIComponent(user.id), {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const updatedBody = await update.json().catch(() => ({}));
    if (!update.ok) {
      console.error('Supabase admin update password:', update.status, updatedBody);
      return res.status(502).json({ error: 'Não foi possível redefinir a senha agora. Tente novamente.' });
    }

    const resend = new Resend(resendKey);
    const { error: mailError } = await resend.emails.send({
      from: `VSN Imóveis <${from}>`,
      to: [email],
      subject: 'Sua nova senha de acesso – VSN Imóveis',
      text: `Olá!\n\nRecebemos uma solicitação para recuperar o acesso à Área do Proprietário da VSN Imóveis.\n\nSua nova senha temporária é: ${password}\n\nAcesse sua conta pelo link abaixo:\nhttps://vsn-imoveis.vercel.app/proprietario/\n\nEntre com seu e-mail e a nova senha.\n\nSe você não solicitou esta alteração, entre em contato com a equipe VSN Imóveis.\n\nAtenciosamente,\nEquipe VSN Imóveis`
    });

    if (mailError) {
      console.error('Resend password recovery email:', mailError);
      return res.status(502).json({ error: 'A senha foi redefinida, mas não foi possível enviar o e-mail. Entre em contato com a VSN Imóveis para recuperar o acesso.' });
    }

    return res.status(200).json({ ok: true, message: genericMessage });
  } catch (error) {
    console.error('Proprietor password recovery error:', error);
    return res.status(500).json({ error: 'Falha ao recuperar a senha. Tente novamente.' });
  }
}
