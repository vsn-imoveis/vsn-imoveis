/** @type {import('next').NextConfig} */
const legacyApiNames = [
  'condo-share.js',
  'generate-description.js',
  'identify-condo-fixed.js',
  'identify-condo-structural.js',
  'import-property-link.js',
  'leads.js',
  'location-nearby.js',
  'property-share.js',
  'proprietario-cadastro.js',
  'proprietario-recuperar-senha.js',
  'site-share-image.js',
  'sitemap-properties.js',
]

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return legacyApiNames.map((endpoint) => ({
      source: `/api/${endpoint}`,
      destination: `/api/legacy/${endpoint}`,
    }))
  },
}

export default nextConfig
