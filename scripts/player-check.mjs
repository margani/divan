// End-to-end check of recitations on a real poem: the player opens and plays
// Ganjoor's audio, the line being read is highlighted, tapping a line seeks to
// it, and leaving the poem stops playback. Screenshots go to shots/.
// Usage: npm run dev (in another shell), then node scripts/player-check.mjs [base-url]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] || 'http://localhost:8788';
const poem = '/hafez/ghazal/sh1';
mkdirSync('shots', { recursive: true });
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const problems = [];
let checks = 0;
const expect = (ok, msg) => {
  checks++;
  if (!ok) problems.push(msg);
};
try {
  for (const [vp, viewport, scheme] of [
    ['desktop', { width: 1280, height: 900 }, 'light'],
    ['phone', { width: 390, height: 844 }, 'dark'],
  ]) {
    const ctx = await browser.newContext({ viewport, colorScheme: scheme, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    const mp3 = [];
    page.on('request', (r) => r.url().endsWith('.mp3') && mp3.push(r.url()));

    await page.goto(base + poem);
    await page.waitForSelector('.listen', { timeout: 15000 });
    expect(mp3.length === 0, `${vp}: audio was fetched before pressing play`);
    expect((await page.textContent('#version')) === 'نسخهٔ ۰.۲.۰', `${vp}: footer version is ${await page.textContent('#version')}`);

    await page.click('.listen');
    await page.waitForSelector('.player');
    await page.waitForFunction(() => /[۱-۹]/.test(document.querySelector('.player .time').textContent.split(' از ')[0]), null, {
      timeout: 20000,
    });
    expect(mp3.some((u) => u.startsWith('https://i.ganjoor.net/')), `${vp}: audio not streamed from i.ganjoor.net (${mp3})`);
    expect((await page.getAttribute('.player .play', 'aria-label')) === 'توقف', `${vp}: play button does not show pause`);

    // Tap the fourth hemistich: playback should jump there and light it.
    await page.click('[data-o="4"]');
    await page.waitForSelector('.reading[data-o="4"]', { timeout: 5000 }).catch(() => {});
    expect((await page.locator('.reading').count()) === 1, `${vp}: ${await page.locator('.reading').count()} lines highlighted`);
    expect(await page.locator('.reading[data-o="4"]').count() === 1, `${vp}: tapping line 4 did not highlight it`);
    await page.waitForTimeout(1500);
    const m = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      barCoversFooter: (() => {
        const bar = document.querySelector('.player').getBoundingClientRect();
        window.scrollTo(0, document.body.scrollHeight);
        const v = document.querySelector('#version').getBoundingClientRect();
        return v.bottom > bar.top + 1 && v.top < bar.bottom;
      })(),
    }));
    expect(m.overflow <= 0, `${vp}: scrolls sideways by ${m.overflow}px`);
    expect(!m.barCoversFooter, `${vp}: player covers the footer at the bottom of the page`);
    await page.click('[data-o="4"]');
    await page.waitForTimeout(800);
    await page.screenshot({ path: `shots/player-${vp}-${scheme}.png` });

    // Leaving the poem ends the recitation.
    await page.click('.crumbs a');
    await page.waitForSelector('.books, .poems');
    expect((await page.locator('.player').count()) === 0, `${vp}: player still open after leaving the poem`);
    expect(errors.length === 0, `${vp}: console errors: ${errors.join(' | ')}`);
    await ctx.close();
  }
} catch (err) {
  problems.push(err.message);
} finally {
  await browser.close();
}
console.log(`${checks} checks ran`);
if (checks < 20) problems.push(`only ${checks}/20 checks ran`);
console.log(problems.length ? `FAIL\n${problems.join('\n')}` : 'PASS');
process.exit(problems.length ? 1 : 0);
