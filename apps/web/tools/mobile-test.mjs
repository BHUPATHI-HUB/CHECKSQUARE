// Standalone Playwright script to test mobile responsiveness at 375px.
// Run: node tools/mobile-test.mjs
//
// Visits each major route, captures viewport-overflow info, and writes a
// screenshot + JSON report. Public routes only — protected routes get a
// note (login flow is interactive).

import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';

const BASE = 'http://localhost:3000';
const OUT  = 'tools/mobile-test-out';
mkdirSync(OUT, { recursive: true });

const ROUTES = [
  ['home',        '/',            { auth: false }],
  ['login',       '/login',       { auth: false }],
  ['signup',      '/signup',      { auth: false }],
  ['privacy',     '/privacy',     { auth: false }],
  ['terms',       '/terms',       { auth: false }],
  ['about',       '/about',       { auth: false }],
  ['404',         '/does-not-exist', { auth: false }],
  ['admin-dash',  '/admin/dashboard', { auth: 'admin' }],
  ['admin-set',   '/admin/settings',  { auth: 'admin' }],
  ['inspector',   '/inspector/dashboard', { auth: 'inspector' }],
  ['new-insp',    '/inspector/new-inspection', { auth: 'inspector' }],
  ['customer',    '/customer',    { auth: 'customer' }],
  ['booking',     '/customer/book', { auth: 'customer' }],
  ['chat',        '/chat',        { auth: 'admin' }],
];

const browser = await chromium.launch({ channel: 'chromium' });
const ctx = await browser.newContext({
  ...devices['iPhone 13'], // 390x844; close enough to 375
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});

async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
}

const results = [];

async function measure(page, name, route) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => {
    const wide = [];
    document.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth + 2 && el.children.length < 50) {
        const cls = (typeof el.className === 'string' ? el.className : '').slice(0, 80);
        wide.push({ tag: el.tagName.toLowerCase(), w: Math.round(r.width), right: Math.round(r.right), cls });
      }
    });
    return {
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      scrollW: document.documentElement.scrollWidth,
      bodyScrollW: document.body.scrollWidth,
      overflowing: document.documentElement.scrollWidth > window.innerWidth + 1,
      smMatches: window.matchMedia('(max-width: 640px)').matches,
      title: document.title,
      url: location.href,
      offenders: wide.slice(0, 8),
    };
  });
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(`[${name}] ${route} → innerW=${info.innerW} scrollW=${info.scrollW} overflow=${info.overflowing} offenders=${info.offenders.length}`);
  return { name, route, ...info };
}

const adminPage = await ctx.newPage();
try {
  await login(adminPage, 'admin@app.local', 'Admin@2026');
  console.log('[auth] admin login OK, url=' + adminPage.url());
} catch (e) {
  console.log('[auth] admin login failed: ' + e.message);
}

for (const [name, route, opts] of ROUTES) {
  try {
    results.push(await measure(adminPage, name, route));
  } catch (e) {
    console.log(`[${name}] error: ${e.message}`);
    results.push({ name, route, error: e.message });
  }
}

writeFileSync(`${OUT}/report.json`, JSON.stringify(results, null, 2));

const overflowing = results.filter(r => r.overflowing);
console.log(`\n=== SUMMARY ===`);
console.log(`Routes tested: ${results.length}`);
console.log(`Overflowing  : ${overflowing.length}`);
overflowing.forEach(r => {
  console.log(`  ✗ ${r.name} (${r.route}) scrollW=${r.scrollW}`);
  (r.offenders || []).slice(0, 3).forEach(o => {
    console.log(`      ${o.tag}.${o.cls.replace(/\s+/g, '.')} w=${o.w} right=${o.right}`);
  });
});

await browser.close();
