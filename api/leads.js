import { Resend } from 'resend';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { nome, whatsapp, email, interesse, imovel, mensagem } = req.body || {};

    if (!nome || !whatsapp || !email) {
      return res.status(400).json({ error: 'Dados obrigatórios ausentes' });
    }

    if (!process.env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY não configurada');
      return res.status(500).json({ error: 'Serviço de e-mail não configurado' });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const safe = (v = '') => String(v).replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));

    const from = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

    const { data, error } = await resend.emails.send({
      from: `VSN Imóveis <${from}>`,
      to: ['vsnimoveis@gmail.com'],
      replyTo: email,
      subject: `Novo lead — ${safe(nome)}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#18212b">
          <h2>Novo lead recebido pelo site VSN Imóveis</h2>
          <p><b>Nome:</b> ${safe(nome)}</p>
          <p><b>WhatsApp:</b> ${safe(whatsapp)}</p>
          <p><b>E-mail:</b> ${safe(email)}</p>
          <p><b>Interesse:</b> ${safe(interesse)}</p>
          <p><b>Imóvel/região:</b> ${safe(imovel)}</p>
          <p><b>Mensagem:</b><br>${safe(mensagem)}</p>
        </div>
      `
    });

    // Resend can return an error object without throwing.
    // Never tell the customer that the lead was sent if Resend rejected it.
    if (error) {
      console.error('Resend error:', error);
      return res.status(502).json({
        error: 'Não foi possível enviar o lead por e-mail',
        details: error.message || 'Erro no serviço de e-mail'
      });
    }

    return res.status(200).json({ ok: true, id: data?.id });
  } catch (error) {
    console.error('Lead API error:', error);
    return res.status(500).json({ error: 'Falha ao enviar lead' });
  }
}
