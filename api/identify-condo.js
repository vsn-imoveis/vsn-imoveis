export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const body = req.method === 'POST' ? (req.body || {}) : {};
  const query = String(req.query?.q ?? body.q ?? '').trim();

  if (!query) return res.status(400).json({ error: 'Informe a pesquisa em q.' });

  try {
    const googleUrl = 'https://www.google.com/search?' + new URLSearchParams({
      q: query, hl: 'pt-BR', gl: 'br', num: '10'
    }).toString();

    const response = await fetch(googleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
      },
      redirect: 'follow'
    });

    const html = await response.text();

    if (!response.ok) {
      return res.status(502).json({
        error: 'Falha na busca',
        google_status: response.status,
        google_url: googleUrl,
        response_preview: html.slice(0, 1000)
      });
    }

    const clean = s => String(s || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
      .replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ').trim();

    const results = [];
    const seen = new Set();
    const blocks = html.match(/<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>[\s\S]*?<\/a>/gi) || [];

    for (const block of blocks) {
      const href = block.match(/<a[^>]+href="([^"]+)"/i)?.[1] || '';
      const titleRaw = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || '';
      let url = href;

      if (url.startsWith('/url?q=')) url = url.slice(7).split('&')[0];
      try { url = decodeURIComponent(url); } catch {}

      if (!/^https?:\/\//i.test(url)) continue;

      try {
        if (/google\./i.test(new URL(url).hostname)) continue;
      } catch { continue; }

      const title = clean(titleRaw);
      if (!title || seen.has(url)) continue;

      seen.add(url);
      results.push({ title, url });
      if (results.length >= 10) break;
    }

    return res.status(200).json({
      query,
      provider: 'Google',
      first_result: results[0] || null,
      results,
      debug: {
        google_status: response.status,
        google_url: googleUrl,
        html_length: html.length,
        h3_blocks: blocks.length
      }
    });
  } catch (e) {
    return res.status(500).json({
      error: 'Erro na pesquisa do Google',
      details: String(e?.message || e)
    });
  }
}
