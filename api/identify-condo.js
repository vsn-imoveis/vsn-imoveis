export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const query = String(req.query?.q ?? '').trim();

  return res.status(200).json({
    ok: true,
    query,
    message: 'API funcionando. Google ainda não foi chamado.'
  });
}
