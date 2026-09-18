export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const query = String(req.query?.q ?? '').trim();
  if (!query) return res.status(400).json({ error: 'Informe q.' });

  try {
    const googleUrl = 'https://www.google.com/search?q=' + encodeURIComponent(query) + '&hl=pt-BR&gl=br';

    const response = await fetch(googleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9'
      }
    });

    const html = await response.text();

    if (!response.ok) {
      return res.status(502).json({
        error: 'Google não aceitou a pesquisa',
        google_status: response.status,
        google_url: googleUrl,
        preview: html.slice(0, 500)
      });
    }

    const clean = s => String(s || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&#x27;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const results = [];
    const seen = new Set();

    const re = /<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>[\s\S]*?<\/a>/gi;
    let m;

    while ((m = re.exec(html)) && results.length < 10) {
      let url = m[1];
      const title = clean(m[2]);

      if (url.startsWith('/url?q=')) url = url.slice(7).split('&')[0];
      try { url = decodeURIComponent(url); } catch {}

      if (!/^https?:\/\//i.test(url)) continue;
      try {
        if (/google\./i.test(new URL(url).hostname)) continue;
      } catch { continue; }

      if (!title || seen.has(url)) continue;
      seen.add(url);
      results.push({ title, url });
    }

    return res.status(200).json({
      query,
      provider: 'Google',
      first_result: results[0] || null,
      results
    });
  } catch (e) {
    return res.status(500).json({
      error: 'Erro na pesquisa',
      details: String(e?.message || e)
    });
  }
}
