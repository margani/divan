// Checks the home page poet finder: search (including full names), the
// letter popup, jumping to a letter below the sticky bar, and the order
// being remembered. Usage: npm run dev, then node scripts/finder-check.mjs [base-url]
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
try {
  for (const [vp, viewport, scheme] of [
    ['phone', { width: 390, height: 844 }, 'light'],
    ['desktop', { width: 1280, height: 900 }, 'dark'],
  ]) {
    const ctx = await browser.newContext({ viewport, colorScheme: scheme, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/');
    await page.waitForSelector('.poets a');
    expect((await page.locator('.poets a').count()) >= 240, `${vp}: century view lists ${await page.locator('.poets a').count()} poets`);
    await page.screenshot({ path: `shots/finder-${vp}-${scheme}.png` });

    await page.fill('.search', 'مولوی');
    const hits = await page.locator('.poets a').allTextContents();
    expect(hits.length === 1 && hits[0] === 'مولانا', `${vp}: «مولوی» found ${JSON.stringify(hits)}`);
    await page.fill('.search', 'حافظ');
    expect((await page.locator('.poets a').allTextContents()).includes('حافظ'), `${vp}: «حافظ» not found`);
    await page.fill('.search', 'zzzz');
    expect((await page.textContent('.found')).startsWith('سخنوری'), `${vp}: no "not found" message`);
    await page.fill('.search', '');

    await page.click('.letters-btn');
    expect(await page.locator('dialog.letters').isVisible(), `${vp}: letter popup did not open`);
    const disabled = await page.locator('.letters-grid button:disabled').allTextContents();
    expect(disabled.join('') === 'ثچذزژضگ', `${vp}: disabled letters are ${disabled.join('')}`);
    await page.screenshot({ path: `shots/finder-letters-${vp}-${scheme}.png` });
    await page.click('.letters-grid button[value="ع"]');
    await page.waitForTimeout(300);
    expect(!(await page.locator('dialog.letters').isVisible()), `${vp}: popup still open after choosing`);
    expect((await page.getAttribute('[data-order="alpha"]', 'aria-pressed')) === 'true', `${vp}: did not switch to alphabetical`);
    const pos = await page.evaluate(() => {
      const hd = document.getElementById('letter-ع').getBoundingClientRect();
      const bar = document.querySelector('.finder').getBoundingClientRect();
      return { top: hd.top, barBottom: bar.bottom };
    });
    expect(pos.top >= pos.barBottom - 1 && pos.top < pos.barBottom + 80, `${vp}: «ع» heading at ${pos.top}, bar ends at ${pos.barBottom}`);
    const firstUnder = await page.evaluate(() => document.getElementById('letter-ع').nextElementSibling.querySelector('a').textContent);
    expect(firstUnder.startsWith('ع'), `${vp}: first poet under ع is ${firstUnder}`);
    await page.screenshot({ path: `shots/finder-jump-${vp}-${scheme}.png` });

    await page.reload();
    await page.waitForSelector('.poets a');
    expect((await page.getAttribute('[data-order="alpha"]', 'aria-pressed')) === 'true', `${vp}: alphabetical order not remembered`);
    expect((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0, `${vp}: sideways scroll`);
    expect(errors.length === 0, `${vp}: ${errors.join(' | ')}`);
    await ctx.close();
  }
} catch (err) {
  problems.push(err.message);
} finally {
  await browser.close();
}
console.log(`${checks} checks ran`);
if (checks < 24) problems.push(`only ${checks}/24 checks ran`);
console.log(problems.length ? `FAIL\n${problems.join('\n')}` : 'PASS');
process.exit(problems.length ? 1 : 0);
