/**
 * VersusCRM tenant bootstrap (opt-in).
 *
 * This file is deliberately not included by the existing VSN pages.
 * Tenant pages may call resolveCrmTenant(slug) once their route is integrated.
 */
(function (global) {
  'use strict';

  const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  const cache = new Map();

  async function resolveCrmTenant(slug) {
    const normalized = String(slug || '').trim().toLowerCase();
    if (!SLUG_RE.test(normalized)) {
      throw new Error('Identificador da imobiliária inválido.');
    }

    if (cache.has(normalized)) return cache.get(normalized);

    const pending = fetch('/api/crm-tenant?slug=' + encodeURIComponent(normalized), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'omit'
    }).then(async function (response) {
      const body = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        throw new Error(body.error || 'Não foi possível identificar a imobiliária.');
      }
      if (!body || body.slug !== normalized || !body.id || body.status) {
        // A API intentionally omits private fields and does not expose status.
        if (!body || body.slug !== normalized || !body.id) {
          throw new Error('Resposta inválida ao identificar a imobiliária.');
        }
      }
      return Object.freeze({
        id: String(body.id),
        name: String(body.name || 'Imobiliária'),
        slug: normalized,
        logo_url: typeof body.logo_url === 'string' ? body.logo_url : null,
        primary_color: /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(body.primary_color || '')
          ? body.primary_color
          : '#d3aa62'
      });
    }).catch(function (error) {
      cache.delete(normalized);
      throw error;
    });

    cache.set(normalized, pending);
    return pending;
  }

  global.VersusCRM = Object.assign({}, global.VersusCRM, {
    resolveTenant: resolveCrmTenant
  });
})(window);
