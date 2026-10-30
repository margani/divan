// Checks that a returning reader gets new code right after a release even
// when JS is served with a long browser cache, as the whosane.dev zone does
// (max-age=14400 on JS/CSS). Serves a copy of public/ with that header (and
// ETags), proxies /api to the dev server, and changes version.js between
// two visits. Playwright's request interception would disable the HTTP
// cache, so a real server is needed.
// Usage: npm run dev (for /api), then node scripts/update-check.mjs
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { cpSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

const api = 'http://localhost:8788';
const dir = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'divan-update-'));
cpSync(new URL('../public', import.meta.url).pathname, dir, { recursive: true });
// A release changes both version.js and sw.js, as a real version bump does.
const swPath = join(dir, 'sw.js');
const swSource = readFileSync(swPath, 'utf8');
const setVersion = (v) => {
  writeFileSync(join(dir, 'js/version.js'), `export const VERSION = '${v}';\n`);
  writeFileSync(swPath, swSource.replace(/^const VERSION = '[^']+';/m, `const VERSION = '${v}';`));
};
setVersion('9.9.1');

const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  if (process.env.LOG) console.log(req.method, req.url, req.headers["if-none-match"] ? "(conditional)" : "");
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    const r = await fetch(api + url.pathname + url.search);
    res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/json' });
    return res.end(Buffer.from(await r.arrayBuffer()));
  }
  let file = join(dir, url.pathname);
  try {
    if (statSync(file).isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(dir, 'index.html');
  }
  const body = readFileSync(file);
  const etag = `"${createHash('md5').update(body).digest('hex')}"`;
  const ext = extname(file);
  const headers = {
    'content-type': types[ext] || 'application/octet-stream',
    etag,
    // What the zone does to code and styles; pages and sw.js stay fresh.
    'cache-control': ext === '.js' && !file.endsWith('sw.js') || ext === '.css' ? 'public, max-age=14400, must-revalidate' : 'public, max-age=0, must-revalidate',
  };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  res.writeHead(200, headers);
  res.end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://localhost:${server.address().port}`;

const browser = await chromium.launch();
let failed = false;
try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(base + '/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForSelector('.poets a');
  const before = await page.textContent('#version');
  // A first visit installs quietly: no update offer.
  if ((await page.locator('.update-bar').count()) !== 0) {
    console.log('update bar shown on a first visit');
    failed = true;
  }
  await page.close();
  setVersion('9.9.2');
  if (process.env.LOG) console.log('--- release, new visit ---');
  // A returning reader: a fresh visit in a new tab, same browser profile.
  const again = await ctx.newPage();
  await again.goto(base + '/');
  await again.waitForSelector('.poets a');
  const after = await again.textContent('#version');
  console.log({ before, after });
  if (!before.includes('۹.۹.۱') || !after.includes('۹.۹.۲')) failed = true;

  // A page left open across a release: coming back to it shows the update
  // bar, and its button switches to the new version.
  setVersion('9.9.3');
  await again.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const bar = again.locator('.update-bar');
  await bar.waitFor({ timeout: 15000 });
  const barText = (await bar.textContent()).trim();
  await again.setViewportSize({ width: 390, height: 844 });
  await again.screenshot({ path: 'shots/update-bar-phone.png' });
  console.log({ barText });
  if (!/^[\u0600-\u06FF]/.test(barText)) failed = true;
  // Nothing reloads until the reader asks.
  {
    if (!(await again.textContent('#version')).includes('۹.۹.۲')) failed = true;
  }
  await Promise.all([again.waitForEvent('load'), bar.locator('.update-apply').click()]);
  await again.waitForSelector('.poets a');
  const updated = await again.textContent('#version');
  console.log({ updated });
  if (!updated.includes('۹.۹.۳')) failed = true;
} catch (err) {
  console.error(err.message);
  failed = true;
} finally {
  await browser.close();
  server.close();
  rmSync(dir, { recursive: true });
}
console.log(failed ? 'FAIL' : 'PASS');
process.exit(failed ? 1 : 0);
