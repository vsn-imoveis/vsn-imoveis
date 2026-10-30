import { Resend } from 'resend';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { nome, whatsapp, email, interesse, imovel, mensagem } = req.body || {};

    if (!nome || !whatsapp || !email) {
      return res.status(400).json({ error: 'Dados obrigatórios ausentes' });
    }

    // Persist the lead in the VSN database before sending the notification email.
    const supabaseUrl = process.env.SUPABASE_URL || 'https://jpdfynaioepcmgqlqlht.supabase.co';
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_bDiXCzTT1gXO_xbVGhnAXg_Muy4lx03';
    const saved = await fetch(supabaseUrl + '/rest/v1/leads', {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: 'Bearer ' + supabaseKey,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        nome: String(nome).trim(),
        whatsapp: String(whatsapp).trim(),
        email: String(email).trim().toLowerCase(),
        interesse: interesse || null,
        mensagem: [imovel ? 'Região / imóvel: ' + imovel : '', mensagem || ''].filter(Boolean).join('\\n\\n') || null
      })
    });
    if (!saved.ok) {
      const detail = await saved.text();
      console.error('Supabase lead save error:', saved.status, detail);
      return res.status(500).json({ error: 'Não foi possível registrar seu contato.' });
    }
    const savedRows = await saved.json();
    const leadId = savedRows?.[0]?.id || null;

    if (!process.env.RESEND_API_KEY) {
      console.warn('RESEND_API_KEY não configurada; lead salvo sem e-mail.');
      return res.status(200).json({ ok: true, leadId, emailSent: false });
    }

    try {
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

      if (error) {
        console.error('Resend error (lead already saved):', error);
        return res.status(200).json({ ok: true, leadId, emailSent: false, warning: 'Contato registrado, mas o e-mail de aviso não foi enviado.' });
      }
      return res.status(200).json({ ok: true, leadId, emailSent: true, id: data?.id });
    } catch (emailError) {
      console.error('Resend exception (lead already saved):', emailError);
      return res.status(200).json({ ok: true, leadId, emailSent: false, warning: 'Contato registrado, mas o e-mail de aviso não foi enviado.' });
    }

  } catch (error) {
    console.error('Lead API error:', error);
    return res.status(500).json({ error: 'Falha ao enviar lead', details: error?.message || 'Erro interno no servidor' });
  }
}
