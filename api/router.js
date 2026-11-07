import condoShare from '../server/api/condo-share.js';
import crmPublicProperties from '../server/api/crm-public-properties.js';
import crmTenant from '../server/api/crm-tenant.js';
import generateDescription from '../server/api/generate-description.js';
import identifyCondoFixed from '../server/api/identify-condo-fixed.js';
import identifyCondoStructural from '../server/api/identify-condo-structural.js';
import importPropertyLink from '../server/api/import-property-link.js';
import leads from '../server/api/leads.js';
import locationNearby from '../server/api/location-nearby.js';
import propertyShare from '../server/api/property-share.js';
import proprietarioCadastro from '../server/api/proprietario-cadastro.js';
import proprietarioRecuperarSenha from '../server/api/proprietario-recuperar-senha.js';
import siteShareImage from '../server/api/site-share-image.js';
import sitemapProperties from '../server/api/sitemap-properties.js';
import supabaseConfig from '../server/api/supabase-config.js';
import crmSupabaseConfig from '../server/api/crm-supabase-config.js';

const handlers = {
  'condo-share': condoShare,
  'crm-public-properties': crmPublicProperties,
  'crm-tenant': crmTenant,
  'generate-description': generateDescription,
  'identify-condo-fixed': identifyCondoFixed,
  'identify-condo-structural': identifyCondoStructural,
  'import-property-link': importPropertyLink,
  leads,
  'location-nearby': locationNearby,
  'property-share': propertyShare,
  'proprietario-cadastro': proprietarioCadastro,
  'proprietario-recuperar-senha': proprietarioRecuperarSenha,
  'site-share-image': siteShareImage,
  'sitemap-properties': sitemapProperties,
  'supabase-config': supabaseConfig,
  'crm-supabase-config': crmSupabaseConfig
};

export default async function handler(req, res) {
  const requested = Array.isArray(req.query?.handler)
    ? req.query.handler[0]
    : req.query?.handler;
  const name = String(requested || '').trim();
  const target = handlers[name];

  if (typeof target !== 'function') {
    return res.status(404).json({ ok: false, error: 'Endpoint não encontrado.' });
  }

  return target(req, res);
}
