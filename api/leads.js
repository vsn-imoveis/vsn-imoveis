import { Resend } from 'resend';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { nome, whatsapp, email, interesse, imovel, mensagem } = req.body || {};
    if (!nome || !whatsapp || !email) return res.status(400).json({ error: 'Dados obrigatórios ausentes' });
    const resend = new Resend(process.env.RESEND_API_KEY);
    const safe = (v='') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const result = await resend.emails.send({
      from: 'VSN Imóveis <onboarding@resend.dev>',
      to: ['vsnimoveis@gmail.com'],
      subject: `Novo lead — ${safe(nome)}`,
      html: `<h2>Novo lead recebido pelo site</h2><p><b>Nome:</b> ${safe(nome)}</p><p><b>WhatsApp:</b> ${safe(whatsapp)}</p><p><b>E-mail:</b> ${safe(email)}</p><p><b>Interesse:</b> ${safe(interesse)}</p><p><b>Imóvel/região:</b> ${safe(imovel)}</p><p><b>Mensagem:</b><br>${safe(mensagem)}</p>`
    });
    return res.status(200).json({ ok: true, id: result?.data?.id });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Falha ao enviar lead' });
  }
}
