export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const query = String(req.query?.q || 'hello word').trim();

  try {
    const url = 'https://www.google.com/search?' + new URLSearchParams({
      q: query,
      hl: 'pt-BR',
      gl: 'br',
      num: '10'
    }).toString();

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Google retornou HTTP ' + response.status });
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

    const links = [];
    const seen = new Set();

    const re = /<a[^>]+href="([^"]+)"[^>]*>([\\s\\S]*?)<\\/a>/gi;
    let m;

    while ((m = re.exec(html)) && links.length < 20) {
      let href = m[1];
      const title = clean(m[2]);

      if (href.startsWith('/url?q=')) href = href.slice(7).split('&')[0];
      if (href.startsWith('https://www.google.com/url?q=')) href = href.split('q=')[1]?.split('&')[0] || '';

      try { href = decodeURIComponent(href); } catch {}

      if (!/^https?:\\/\\//i.test(href)) continue;
      if (/google\\.(com|com\\.br)/i.test(new URL(href).hostname)) continue;
      if (!title || title.length < 2) continue;

      if (!seen.has(href)) {
        seen.add(href);
        links.push({ title, url: href });
      }
    }

    const first = links[0] || null;

    return res.status(200).json({
      query,
      provider: 'Google',
      first_link: first?.url || null,
      title: first?.title || null,
      results: links.slice(0, 10)
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Erro na pesquisa do Google',
      details: String(error?.message || error)
    });
  }
}
