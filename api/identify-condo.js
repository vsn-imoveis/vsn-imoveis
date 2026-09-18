export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const original = String(req.query?.q || '').trim();
  if (!original) return res.status(400).json({ error: 'Informe o endereço em q.' });

  // Usa somente logradouro + número, descartando bairro/cidade/UF.
  const parts = original.split(',').map(s => s.trim()).filter(Boolean);
  const query = parts.length >= 2 ? parts.slice(0, 2).join(' ') : original;

  try {
    const googleUrl =
      'https://www.google.com/search?q=' +
      encodeURIComponent(query) +
      '&hl=pt-BR&gl=br&num=10&gbv=1';

    const response = await fetch(googleUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9'
      }
    });

    const html = await response.text();

    if (!response.ok) {
      return res.status(502).json({
        error: 'Falha na pesquisa',
        google_status: response.status,
        query
      });
    }

    const results = [];
    const seen = new Set();

    // Extrai links que aparecem junto de títulos <h3> nos resultados do Google.
    const re = /<a[^>]+href="([^"]+)"[^>]*>[\\s\\S]*?<h3[^>]*>([\\s\\S]*?)<\\/h3>[\\s\\S]*?<\\/a>/gi;
    let match;

    while ((match = re.exec(html)) && results.length < 10) {
      let url = match[1];
      let title = match[2]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\\s+/g, ' ')
        .trim();

      if (url.startsWith('/url?')) {
        const m = url.match(/[?&](?:q|url)=([^&]+)/i);
        url = m ? decodeURIComponent(m[1]) : '';
      }

      if (!/^https?:\\/\\//i.test(url)) continue;
      if (/google\\./i.test(url)) continue;
      if (!title || seen.has(url)) continue;

      seen.add(url);
      results.push({ title, url });
    }

    const lower = html.toLowerCase();

    return res.status(200).json({
      query,
      provider: 'Google',
      first_result: results[0] || null,
      results,
      debug: {
        google_status: response.status,
        html_length: html.length,
        blocked: /captcha|unusual traffic|before you continue|consent\\.google/i.test(lower)
      }
    });
  } catch (e) {
    return res.status(500).json({
      error: 'Erro interno na pesquisa',
      details: String(e && e.message ? e.message : e),
      query
    });
  }
}
