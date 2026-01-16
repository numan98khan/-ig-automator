const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

const rawSiteUrl = process.env.SITE_URL || process.env.VITE_SITE_URL;
if (!rawSiteUrl) {
  console.warn('Warning: SITE_URL or VITE_SITE_URL not set. Skipping sitemap/robots generation.');
  process.exit(0);
}
const baseUrl = rawSiteUrl.replace(/\/$/, '');

const indexablePages = [
  { path: '/', changefreq: 'weekly', priority: 1.0 },
  { path: '/pricing', changefreq: 'monthly', priority: 0.8 },
  { path: '/templates', changefreq: 'weekly', priority: 0.8 },
  { path: '/use-cases', changefreq: 'monthly', priority: 0.7 },
  { path: '/legal', changefreq: 'yearly', priority: 0.2 },
];

const lastmod = new Date().toISOString();

const sitemapEntries = indexablePages
  .map((page) => {
    const loc = `${baseUrl}${page.path}`;
    return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${page.changefreq}</changefreq>\n    <priority>${page.priority}</priority>\n  </url>`;
  })
  .join('\n');

const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries}\n</urlset>\n`;

const disallowedPaths = [
  '/app',
  '/login',
  '/signup',
  '/onboarding',
  '/verify-email',
  '/accept-invite',
  '/request-password-reset',
  '/reset-password',
  '/inbox',
  '/crm',
  '/automations',
  '/settings',
  '/billing',
  '/support',
  '/dashboard',
];

const robotsLines = [
  'User-agent: *',
  ...disallowedPaths.map((path) => `Disallow: ${path}`),
  '',
  `Sitemap: ${baseUrl}/sitemap.xml`,
];
const robotsTxt = `${robotsLines.join('\n')}\n`;

fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemapXml);
fs.writeFileSync(path.join(publicDir, 'robots.txt'), robotsTxt);
