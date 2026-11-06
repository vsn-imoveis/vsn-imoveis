export default function handler(_req, res) {
  const url = process.env.SUPABASE_URL || '';
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const payload = JSON.stringify({ url, publishableKey });
  return res.status(200).send('window.__SUPABASE_CONFIG__ = Object.freeze(' + payload + ');');
}
