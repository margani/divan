// Checks a reader coming from the previous release. Their old service worker
// keeps control until they tap «به‌روزرسانی», but it already serves the new
// code (network first) while answering /api from its own data cache: in
// 0.8.0 that handed the new /api/sung reader the 0.7.0 payload, and every
// song mark and filter silently vanished. One origin proxies to the old
// release, a reader visits with the service worker installed, then the
// origin switches to the new release and the reader comes back.
// Usage: run the previous release (a git worktree) and this one under
// `wrangler pages dev` on two ports, then
//   node scripts/upgrade-check.mjs http://localhost:8789 http://localhost:8788
import { chromium } from 'playwright';
import { createServer } from 'node:http';

const [oldBase, newBase] = process.argv.slice(2);
if (!oldBase || !newBase) {
  console.log('usage: node scripts/upgrade-check.mjs <old-release-url> <new-release-url>');
  process.exit(2);
}
let target = oldBase;
const PASS = ['content-type', 'cache-control', 'etag', 'location'];
const server = createServer(async (req, res) => {
  const r = await fetch(target + req.url, {
    headers: Object.fromEntries(['if-none-match', 'accept'].filter((h) => req.headers[h]).map((h) => [h, req.headers[h]])),
    redirect: 'manual',
  });
  res.writeHead(r.status, Object.fromEntries(PASS.filter((h) => r.headers.get(h)).map((h) => [h, r.headers.get(h)])));
  res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://localhost:${server.address().port}`;

const browser = await chromium.launch();
const problems = [];
let checks = 0;
const expect = (ok, msg) => {
  checks++;
  if (!ok) problems.push(msg);
};
// What a reader sees on each page, whichever release they are on.
const PAGES = [
  ['/rahi/tarane', '.poems li.sung'],
  ['/rahi', '.books .sung-count'],
  ['/hafez/ghazal/sh1', '.songs-list .song'],
  ['/hafez/ghazal/sh1', '.listen'],
  ['/', '.poets a'],
];

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(base + '/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  // The old release, as a reader last saw it: every page once, so its data
  // cache holds the old payloads.
  for (const [path, sel] of PAGES) {
    await page.goto(base + path);
    expect(await page.waitForSelector(sel, { timeout: 15000 }).then(() => true, () => false), `old release: ${path} has no ${sel}`);
  }
  const oldVersion = await page.textContent('#version');
  await page.close();

  target = newBase;
  const again = await ctx.newPage();
  const errors = [];
  again.on('pageerror', (e) => errors.push(e.message));
  again.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  for (const [path, sel] of PAGES) {
    await again.goto(base + path);
    expect(await again.waitForSelector(sel, { timeout: 15000 }).then(() => true, () => false), `returning reader, update not tapped: ${path} has no ${sel}`);
  }
  const newVersion = await again.textContent('#version');
  expect(newVersion !== oldVersion, `still showing ${oldVersion}: the new code never arrived, so nothing was tested`);
  expect(errors.length === 0, `returning reader: errors ${errors.join(' | ')}`);
  await again.screenshot({ path: 'shots/upgrade-returning.png' });
  await ctx.close();
} catch (err) {
  problems.push(err.message);
} finally {
  await browser.close();
  server.close();
}
const EXPECTED = 2 * PAGES.length + 2;
console.log(`${checks} checks ran`);
if (checks < EXPECTED) problems.push(`only ${checks}/${EXPECTED} checks ran`);
console.log(problems.length ? `FAIL\n${problems.join('\n')}` : 'PASS');
process.exit(problems.length ? 1 : 0);
