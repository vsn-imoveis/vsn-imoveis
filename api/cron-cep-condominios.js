const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jpdfynaioepcmgqlqlht.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_bDiXCzTT1gXO_xbVGhnAXg_Muy4lx03';

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    ...extra
  };
}

function digits(v) {
  const s = String(v || '').replace(/[^0-9]/g, '');
  return s || null;
}

function normalizeText(v) {
  return String(v || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().trim();
}

function resolveCep(name, number, results) {
  const n = Number(digits(number));
  const target = normalizeText(name);
  const candidates = new Set();
  const all = new Set();

  for (const r of Array.isArray(results) ? results : []) {
    const cep = digits(r.cep);
    if (!cep) continue;
    all.add(cep);

    const nm = normalizeText(r.nome);
    if (target && nm && (nm === target || nm.includes(target) || target.includes(nm))) {
      candidates.add(cep);
      continue;
    }
    if (!Number.isFinite(n)) continue;

    const comp = normalizeText(r.complemento);
    const exact = comp.match(/^[- ]*(\\d+)$/);
    if (exact && Number(exact[1]) === n) {
      candidates.add(cep);
      continue;
    }

    let m = comp.match(/de\\s+(\\d+)\\s*\\/\\s*(\\d+)\\s+ao fim/);
    if (m && n >= Number(m[1])) {
      const start = Number(m[1]);
      if ((n % 2) === (start % 2)) candidates.add(cep);
      continue;
    }

    m = comp.match(/de\\s+(\\d+)(?:\\s*\\/\\s*\\d+)?\\s+a\\s+(\\d+)(?:\\s*\\/\\s*\\d+)?/);
    if (m) {
      const lo = Number(m[1]), hi = Number(m[2]);
      if (n >= lo && n <= hi) candidates.add(cep);
      continue;
    }

    m = comp.match(/ate\\s+(\\d+)(?:\\s*\\/\\s*\\d+)?/);
    if (m) {
      const hi = Number(m[1]);
      const isPar = comp.includes('lado par');
      const isImpar = comp.includes('lado impar');
      if (n <= hi && ((!isPar && !isImpar) || (isPar && n % 2 === 0) || (isImpar && n % 2 === 1))) {
        candidates.add(cep);
      }
      continue;
    }

    m = comp.match(/de\\s+(\\d+)(?:\\s*\\/\\s*\\d+)?\\s+ao fim/);
    if (m && n >= Number(m[1])) candidates.add(cep);
  }

  return candidates.size === 1 ? [...candidates][0] : (candidates.size === 0 && all.size === 1 ? [...all][0] : null);
}

async function supabase(path, options = {}) {
  const r = await fetch(SUPABASE_URL + path, { ...options, headers: headers(options.headers || {}) });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok) throw new Error('Supabase ' + r.status + ': ' + text.slice(0, 500));
  return data;
}

async function processStreet(row) {
  const url = 'https://cepify.com.br/ws/' + encodeURIComponent(row.state) + '/' + encodeURIComponent(row.city) + '/' + encodeURIComponent(row.address) + '/json';
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    const response = r.ok ? await r.json() : { error: 'CEPify HTTP ' + r.status };
    return { row, response, ok: r.ok };
  } catch (e) {
    return { row, response: { error: String(e.message || e) }, ok: false };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ ok: false });

  try {
    const rows = await supabase('/rest/v1/condominium_cep_street_queue?select=id,state,city,address&status=eq.pending&order=id.asc&limit=20');
    if (!rows.length) return res.status(200).json({ ok: true, message: 'fila concluida', processed: 0 });

    const results = await Promise.all(rows.map(processStreet));
    let updated = 0, done = 0, errors = 0;

    for (const item of results) {
      const { row, response, ok } = item;
      const condos = await supabase(
        '/rest/v1/condominiums?select=id,name,number&state=eq.' + encodeURIComponent(row.state) +
        '&city=eq.' + encodeURIComponent(row.city) +
        '&address=eq.' + encodeURIComponent(row.address) +
        '&cep=is.null&limit=1000'
      );

      for (const condo of condos) {
        const cep = resolveCep(condo.name, condo.number, response);
        if (cep) {
          await supabase('/rest/v1/condominiums?id=eq.' + encodeURIComponent(condo.id), {
            method: 'PATCH',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({ cep })
          });
          updated++;
        }
      }

      await supabase('/rest/v1/condominium_cep_street_queue?id=eq.' + row.id, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          status: ok ? 'done' : 'error',
          response,
          updated_at: new Date().toISOString()
        })
      });
      if (ok) done++; else errors++;
    }

    return res.status(200).json({ ok: true, processed: rows.length, done, errors, condos_updated: updated });
  } catch (e) {
    console.error('[VSN CEP CRON]', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
