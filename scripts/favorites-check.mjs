// Checks favourites: a poem and a single couplet can be saved from the poem
// page and survive a reload, the favourites page (/favorites, linked from
// the header) shows the couplet's own text and the poem, items can be
// removed there, and a browser that refuses storage says so instead of
// pretending it saved.
// Usage: npm run dev (in another shell), then node scripts/favorites-check.mjs [base-url]
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
const POEM = '/hafez/ghazal/sh1';

try {
  for (const [vp, viewport] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 900 }]]) {
    for (const scheme of ['light', 'dark']) {
      const tag = `${vp}/${scheme}`;
      const ctx = await browser.newContext({ viewport, colorScheme: scheme, serviceWorkers: 'block' });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));

      await page.goto(base + POEM);
      const poemBtn = page.locator('.fav-poem');
      await poemBtn.waitFor();
      expect((await poemBtn.getAttribute('aria-pressed')) === 'false' && persian(await poemBtn.textContent()), `${tag}: poem button «${await poemBtn.textContent()}»`);
      await poemBtn.click();
      expect((await poemBtn.getAttribute('aria-pressed')) === 'true', `${tag}: poem not marked saved`);

      // Tap a couplet: a bar to save it appears beneath it.
      const couplet = page.locator('.poem .couplet').nth(1);
      const lines = await couplet.locator('p').allTextContents();
      await couplet.click();
      const coupletBtn = page.locator('.verse-actions .fav-couplet');
      await coupletBtn.waitFor();
      expect(persian(await coupletBtn.textContent()) && (await couplet.evaluate((el) => el.classList.contains('selected'))), `${tag}: couplet bar «${await coupletBtn.textContent()}»`);
      await coupletBtn.click();
      expect((await coupletBtn.getAttribute('aria-pressed')) === 'true' && (await couplet.evaluate((el) => el.classList.contains('faved'))), `${tag}: couplet not marked saved`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow <= 0, `${tag}: poem page scrolls sideways by ${overflow}px`);
      await page.screenshot({ path: `shots/fav-poem-${vp}-${scheme}.png` });
      await page.locator('.fav-close').click();
      expect((await page.locator('.verse-actions').count()) === 0 && (await page.locator('.poem .selected').count()) === 0, `${tag}: «بستن» left the bar open`);

      // Both survive a reload.
      await page.reload();
      await poemBtn.waitFor();
      expect((await poemBtn.getAttribute('aria-pressed')) === 'true', `${tag}: saved poem forgotten after a reload`);
      expect(await couplet.evaluate((el) => el.classList.contains('faved')), `${tag}: saved couplet forgotten after a reload`);

      // The favourites page, from the header.
      await page.click('.fav-link');
      await page.waitForSelector('.favorites h1');
      expect(new URL(page.url()).pathname === '/favorites' && (await page.locator('.fav-link').getAttribute('aria-current')) === 'page', `${tag}: header link didn't open /favorites`);
      const saved = await page.locator('.fav-couplets blockquote p').allTextContents();
      expect(JSON.stringify(saved) === JSON.stringify(lines), `${tag}: saved couplet reads ${JSON.stringify(saved)}, poem had ${JSON.stringify(lines)}`);
      expect((await page.locator(`.fav-poems a[href="${POEM}"]`).count()) === 1 && (await page.locator(`.fav-couplets a[href="${POEM}"]`).count()) === 1, `${tag}: poem links missing`);
      const texts = await page.locator('.favorites h1, .favorites h2, .favorites .lede, .fav-remove').allTextContents();
      expect(texts.length > 0 && texts.every(persian), `${tag}: text not starting with a Persian letter: ${texts.filter((t) => !persian(t)).join(' | ')}`);
      const junk = (await page.textContent('#app')).match(/\bfalse\b|\bnull\b|undefined|\[object/);
      expect(!junk, `${tag}: junk text on the favourites page: ${junk?.[0]}`);
      const favOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(favOverflow <= 0, `${tag}: favourites page scrolls sideways by ${favOverflow}px`);
      await page.screenshot({ path: `shots/fav-page-${vp}-${scheme}.png` });

      // Removing both leaves the empty page.
      await page.locator('.fav-couplets .fav-remove').click();
      await page.locator('.fav-poems .fav-remove').click();
      expect((await page.locator('.fav-couplets li, .fav-poems li').count()) === 0 && (await page.locator('.fav-empty').isVisible()), `${tag}: items left after removing them`);
      await page.goto(base + POEM);
      await poemBtn.waitFor();
      expect((await poemBtn.getAttribute('aria-pressed')) === 'false' && (await page.locator('.poem .faved').count()) === 0, `${tag}: removed favourites still marked on the poem`);
      expect(errors.length === 0, `${tag}: errors ${errors.join(' | ')}`);
      await ctx.close();
    }
  }

  // A browser that refuses storage: the button says so.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await ctx.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException('quota', 'QuotaExceededError');
      };
    });
    const page = await ctx.newPage();
    await page.goto(base + POEM);
    await page.locator('.fav-poem').click();
    const text = await page.locator('.fav-poem').textContent();
    expect(text.includes('اجازه') && (await page.locator('.fav-poem').getAttribute('aria-pressed')) === 'false', `storage refused: button says «${text}»`);
    await ctx.close();
  }
} catch (err) {
  problems.push(err.message);
} finally {
  await browser.close();
}
const EXPECTED = 4 * 17 + 1;
console.log(`${checks} checks ran`);
if (checks < EXPECTED) problems.push(`only ${checks}/${EXPECTED} checks ran`);
console.log(problems.length ? `FAIL\n${problems.join('\n')}` : 'PASS');
process.exit(problems.length ? 1 : 0);
