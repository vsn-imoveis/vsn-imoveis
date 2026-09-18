export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  const query = String(req.query?.q || 'hello word').trim();

  try {
    const googleUrl = 'https://www.google.com/search?' + new URLSearchParams({
      q: query,
      hl: 'pt-BR',
      gl: 'br',
      num: '10'
    }).toString();

    const response = await fetch(googleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      return res.status(502).json({
        error: 'Google retornou HTTP ' + response.status
      });
    }

    const html = await response.text();

    const clean = (value) => String(value || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&#x27;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\\s+/g, ' ')
      .trim();

    const results = [];
    const seen = new Set();

    const regex = /<a[^>]+href="([^"]+)"[^>]*>([\\s\\S]*?)<\\/a>/gi;
    let match;

    while ((match = regex.exec(html)) && results.length < 10) {
      let url = match[1];
      const title = clean(match[2]);

      if (url.startsWith('/url?q=')) {
        url = url.slice(7).split('&')[0];
      }

      try {
        url = decodeURIComponent(url);
      } catch {}

      if (!/^https?:\\/\\//i.test(url)) continue;

      try {
        const host = new URL(url).hostname;
        if (/google\\./i.test(host)) continue;
      } catch {
        continue;
      }

      if (!title || title.length < 2 || seen.has(url)) continue;

      seen.add(url);
      results.push({ title, url });
    }

    const first = results[0] || null;

    return res.status(200).json({
      query,
      provider: 'Google',
      first_result: first
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Erro na pesquisa do Google',
      details: String(error?.message || error)
    });
  }
}
