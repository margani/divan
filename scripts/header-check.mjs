// Checks the header buttons: the theme toggle switches and is remembered
// without a flash, the install button appears when the browser offers an
// install prompt and calls it, and iPhone Safari gets the add-to-home hint.
// Usage: npm run dev (in another shell), then node scripts/header-check.mjs [base-url]
import { chromium, devices } from 'playwright';
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
const bg = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
try {
  // Theme, for both OS settings.
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(base + '/hafez');
    await page.waitForSelector('.books');
    const before = await bg(page);
    expect((await page.locator('#install-btn').isVisible()) === false, `${scheme}: install button shown without an install prompt`);
    await page.screenshot({ path: `shots/header-${scheme}-os.png`, clip: { x: 0, y: 0, width: 390, height: 260 } });
    await page.click('#theme-btn');
    const after = await bg(page);
    const flipped = scheme === 'light' ? 'dark' : 'light';
    expect(before !== after, `${scheme}: background did not change (${before})`);
    expect((await page.getAttribute('html', 'data-theme')) === flipped, `${scheme}: data-theme is not ${flipped}`);
    expect((await page.getAttribute('meta[name="theme-color"]', 'content')) === after, `${scheme}: theme-color meta not updated`);
    // Remembered, and applied before the app's module runs (no flash).
    await page.reload();
    expect((await page.evaluate(() => document.documentElement.dataset.theme)) === flipped, `${scheme}: choice not remembered`);
    await page.waitForSelector('.books');
    expect((await bg(page)) === after, `${scheme}: reloaded page has the wrong background`);
    await page.screenshot({ path: `shots/header-${scheme}-switched.png`, clip: { x: 0, y: 0, width: 390, height: 260 } });
    expect(errors.length === 0, `${scheme}: errors ${errors.join(' | ')}`);
    await ctx.close();
  }

  // Install prompt (Chrome, Edge, Android): fake the event the browser fires.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await page.goto(base + '/');
    await page.waitForSelector('.poets');
    await page.evaluate(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true });
      e.prompt = () => (window.__prompted = true);
      e.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(e);
    });
    expect(await page.locator('#install-btn').isVisible(), 'install button hidden after beforeinstallprompt');
    await page.screenshot({ path: 'shots/header-install-desktop.png', clip: { x: 0, y: 0, width: 1280, height: 200 } });
    await page.click('#install-btn');
    expect((await page.evaluate(() => window.__prompted)) === true, 'install prompt not shown');
    await page.waitForTimeout(100);
    expect((await page.locator('#install-btn').isVisible()) === false, 'install button still shown after accepting');
    await ctx.close();
  }

  // iPhone Safari: no prompt event, so the button explains what to do.
  {
    const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await page.goto(base + '/');
    await page.waitForSelector('.poets');
    expect(await page.locator('#install-btn').isVisible(), 'iPhone: install button hidden');
    await page.click('#install-btn');
    expect(await page.locator('.hint').isVisible(), 'iPhone: no add-to-home hint');
    const text = await page.textContent('.hint');
    expect(/^[؀-ۿ]/.test(text.trim()), 'iPhone: hint does not start with a Persian letter');
    await page.screenshot({ path: 'shots/header-ios-hint.png' });
    await page.click('main');
    expect((await page.locator('.hint').count()) === 0, 'iPhone: hint did not close');
    await ctx.close();
  }
} catch (err) {
  problems.push(err.message);
} finally {
  await browser.close();
}
console.log(`${checks} checks ran`);
if (checks < 21) problems.push(`only ${checks}/21 checks ran`);
console.log(problems.length ? `FAIL\n${problems.join('\n')}` : 'PASS');
process.exit(problems.length ? 1 : 0);
