export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  const query = String(req.query?.q || 'hello word').trim();

  try {
    const url =
      'https://html.duckduckgo.com/html/?' +
      new URLSearchParams({ q: query, kl: 'br-pt' }).toString();

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept-Language': 'pt-BR,pt;q=0.9'
      }
    });

    if (!response.ok) {
      return res.status(502).json({
        error: 'Falha na busca',
        status: response.status
      });
    }

    const html = await response.text();

    const match = html.match(
      /<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i
    );

    if (!match) {
      return res.status(200).json({
        query,
        first_link: null,
        message: 'Nenhum resultado encontrado.'
      });
    }

    const clean = (value) =>
      String(value || '')
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\\s+/g, ' ')
        .trim();

    let link = match[1];

    if (link.startsWith('//')) {
      link = 'https:' + link;
    }

    return res.status(200).json({
      query,
      first_link: link,
      title: clean(match[2])
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Erro na pesquisa',
      details: String(error?.message || error)
    });
  }
}
