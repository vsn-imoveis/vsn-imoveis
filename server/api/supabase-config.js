export default function handler(_req, res) {
  // Configuração exclusiva do VSN Imóveis original.
  // Não reutilizar SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY, que pertencem ao VersusCRM.
  // Prioriza as credenciais próprias do VSN original. No Preview do VersusCRM,
  // permite fallback para a chave pública do banco CRM quando as VSN_* não existem.
  const url = process.env.VSN_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const publishableKey = process.env.VSN_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const payload = JSON.stringify({ url, publishableKey });
  return res.status(200).send('window.__SUPABASE_CONFIG__ = Object.freeze(' + payload + ');');
}
