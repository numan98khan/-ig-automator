const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

const rawSiteUrl = process.env.SITE_URL || process.env.VITE_SITE_URL;
if (!rawSiteUrl) {
  console.warn('Warning: SITE_URL or VITE_SITE_URL not set. Skipping sitemap/robots generation.');
  process.exit(0);
}
const robotsLines = [
  'User-agent: *',
  'Disallow: /',
];
const robotsTxt = `${robotsLines.join('\n')}\n`;

fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(path.join(publicDir, 'robots.txt'), robotsTxt);
