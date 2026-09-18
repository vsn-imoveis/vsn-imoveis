export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const raw = String(req.query?.q ?? '').trim();
  const query = raw.replace(/^\s+|\s+$/g, '');

  if (!query) return res.status(400).json({ error: 'Informe o endereço em q.' });

  try {
    const googleUrl = 'https://www.google.com/search?' + new URLSearchParams({
      q: query,
      hl: 'pt-BR',
      gl: 'br',
      num: '10',
      gbv: '1'
    }).toString();

    const response = await fetch(googleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
      },
      redirect: 'follow'
    });

    const html = await response.text();

    if (!response.ok) {
      return res.status(502).json({
        error: 'Falha na busca do Google',
        google_status: response.status
      });
    }

    const decode = (s) => String(s || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&#x27;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/\s+/g, ' ')
      .trim();

    const results = [];
    const seen = new Set();

    // Google commonly puts the destination link and its <h3> title in the same result block.
    const patterns = [
      /<a[^>]+href="([^"]+)"[^>]*>[\s\S]{0,5000}?<h3[^>]*>([\s\S]*?)<\/h3>[\s\S]{0,5000}?<\/a>/gi,
      /<h3[^>]*>([\s\S]*?)<\/h3>[\s\S]{0,5000}?<a[^>]+href="([^"]+)"/gi
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        let href = pattern === patterns[0] ? match[1] : match[2];
        const titleRaw = pattern === patterns[0] ? match[2] : match[1];

        if (!href) continue;

        href = href.replace(/&amp;/g, '&');
        if (href.startsWith('/url?')) {
          const m = href.match(/[?&](?:q|url)=([^&]+)/i);
          href = m ? m[1] : '';
        }

        try { href = decodeURIComponent(href); } catch {}

        if (!/^https?:\/\//i.test(href)) continue;
        if (/https?:\/\/(?:www\.)?google\./i.test(href)) continue;

        const title = decode(titleRaw);
        if (!title || seen.has(href)) continue;

        seen.add(href);
        results.push({ title, url: href });

        if (results.length >= 10) break;
      }
      if (results.length >= 10) break;
    }

    const lower = html.toLowerCase();
    const blocked = /captcha|unusual traffic|consent\.google|before you continue/i.test(lower);

    return res.status(200).json({
      query,
      provider: 'Google',
      first_result: results[0] || null,
      results,
      debug: {
        google_status: response.status,
        html_length: html.length,
        blocked
      }
    });
  } catch (e) {
    return res.status(500).json({
      error: 'Erro na pesquisa do Google',
      details: String(e?.message || e)
    });
  }
}
