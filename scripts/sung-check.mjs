// Checks the "poems with songs" filter: a book marks the poems Ganjoor's music
// index lists, «فقط شعرهای ترانه‌شده» narrows the list to them and survives
// going back from a poem and a reload, a poet page counts each book's sung
// poems, a book without any shows no filter, and a failing index leaves the
// page as it was.
// Usage: npm run dev (in another shell), then node scripts/sung-check.mjs [base-url]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] || 'http://localhost:8788';
mkdirSync('shots', { recursive: true });
const browser = await chromium.launch();
const problems = [];
let checks = 0;
const expect = (ok, msg) => {
  checks++;
  if (!ok) problems.push(msg);
};
const persian = (s) => /^[\u0600-\u06FF]/.test(s.trim());
const visible = (page) => page.locator('.poems li:visible');

try {
  for (const [vp, viewport] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 900 }]]) {
    for (const scheme of ['light', 'dark']) {
      const tag = `${vp}/${scheme}`;
      const ctx = await browser.newContext({ viewport, colorScheme: scheme, serviceWorkers: 'block' });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));

      // A book: sung poems are marked and the filter narrows to them.
      await page.goto(base + '/rahi/tarane');
      const filter = page.locator('.sung-filter');
      await filter.waitFor();
      const total = await page.locator('.poems li').count();
      const marked = await page.locator('.poems li.sung').count();
      expect(marked > 10 && marked < total, `${tag}: ${marked} of ${total} poems marked`);
      expect((await page.locator('.poems li.sung .sung-mark').count()) === marked, `${tag}: marked rows without the note`);
      expect(await page.locator('.poems li.sung a[href="/rahi/tarane/sh20"]').count() === 1, `${tag}: «کاروان» (sh20) not marked`);
      const label = await filter.textContent();
      expect(persian(label) && label.includes(`(${marked.toLocaleString('fa-IR')})`), `${tag}: filter label «${label}»`);
      expect((await filter.getAttribute('aria-pressed')) === 'false', `${tag}: filter starts pressed`);
      await page.screenshot({ path: `shots/sung-book-${vp}-${scheme}.png` });

      await filter.click();
      expect((await visible(page).count()) === marked, `${tag}: ${await visible(page).count()} rows shown, ${marked} sung`);
      expect((await page.locator('.poems li:visible:not(.sung)').count()) === 0, `${tag}: a poem without songs still shown`);
      expect(new URL(page.url()).search === '?songs', `${tag}: filter not in the URL (${page.url()})`);
      expect((await filter.getAttribute('aria-pressed')) === 'true', `${tag}: filter not marked pressed`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow <= 0, `${tag}: scrolls sideways by ${overflow}px`);
      await page.screenshot({ path: `shots/sung-filtered-${vp}-${scheme}.png` });

      // Back from a poem, and a reload, keep the narrowed list.
      await page.click('.poems a[href="/rahi/tarane/sh20"]');
      await page.waitForSelector('.poem-head');
      await page.goBack();
      await page.locator('.sung-filter[aria-pressed="true"]').waitFor();
      expect((await visible(page).count()) === marked, `${tag}: filter lost after going back`);
      await page.reload();
      await page.locator('.sung-filter[aria-pressed="true"]').waitFor();
      expect((await visible(page).count()) === marked, `${tag}: filter lost after a reload`);
      await page.locator('.sung-filter').click();
      expect((await visible(page).count()) === total, `${tag}: turning the filter off didn't bring every poem back`);
      expect(new URL(page.url()).search === '', `${tag}: URL kept ?songs after turning it off`);

      // A poet page counts each book's sung poems.
      await page.goto(base + '/rahi');
      await page.waitForSelector('.books .sung-count');
      const tarane = await page.locator('.books a[href="/rahi/tarane"] .sung-count').textContent();
      expect(tarane.trim() === marked.toLocaleString('fa-IR'), `${tag}: tarane book counts «${tarane}», list has ${marked}`);
      expect((await page.locator('.books a[href="/rahi/robaeeha"] .sung-count').count()) === 0, `${tag}: a book without songs shows a count`);
      const junk = (await page.textContent('#app')).match(/\bfalse\b|\bnull\b|undefined|\[object/);
      expect(!junk, `${tag}: junk text on the poet page: ${junk?.[0]}`);
      const books = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(books <= 0, `${tag}: poet page scrolls sideways by ${books}px`);
      await page.locator('.books').screenshot({ path: `shots/sung-poet-${vp}-${scheme}.png` });

      // A book whose poems have no songs offers no filter.
      const indexRead = page.waitForResponse((r) => r.url().endsWith('/api/sung'));
      await page.goto(base + '/rahi/robaeeha');
      await page.waitForSelector('.poems li');
      await indexRead;
      await page.waitForTimeout(300);
      expect((await page.locator('.sung-filter, .sung-mark').count()) === 0, `${tag}: filter or marks on a book without songs`);
      expect(errors.length === 0, `${tag}: errors ${errors.join(' | ')}`);
      await ctx.close();
    }
  }

  // The index failing leaves the book as it was, with no errors.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/api/sung', (r) => r.fulfill({ status: 502, body: '{"error":"upstream"}' }));
    await page.goto(base + '/rahi/tarane?songs');
    await page.waitForSelector('.poems li');
    await page.waitForTimeout(800);
    const total = await page.locator('.poems li').count();
    expect(total > 20 && (await visible(page).count()) === total, 'index down: poems hidden');
    expect((await page.locator('.sung-filter').count()) === 0, 'index down: filter shown anyway');
    expect(errors.length === 0, `index down: errors ${errors.join(' | ')}`);
    await ctx.close();
  }
} catch (err) {
  problems.push(err.message);
} finally {
  await browser.close();
}
const EXPECTED = 4 * 20 + 3;
console.log(`${checks} checks ran`);
if (checks < EXPECTED) problems.push(`only ${checks}/${EXPECTED} checks ran`);
console.log(problems.length ? `FAIL\n${problems.join('\n')}` : 'PASS');
process.exit(problems.length ? 1 : 0);
