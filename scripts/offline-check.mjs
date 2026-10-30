// Checks the PWA basics: the service worker activates, the manifest has
// installable icons, and a poem opened once still renders offline.
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8788';
const poem = '/hafez/ghazal/sh1';
const browser = await chromium.launch();
let failed = false;
try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(base + poem);
  await page.waitForSelector('.couplet');
  await page.evaluate(() => navigator.serviceWorker.ready);
  // Load once more under the active worker so the data cache holds the poem.
  await page.reload();
  await page.waitForSelector('.couplet');
  const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
  const sizes = manifest.icons.map((i) => i.sizes);
  console.log('manifest icons', sizes.join(' '), 'display', manifest.display);
  if (!sizes.includes('192x192') || !sizes.includes('512x512')) failed = true;

  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('.couplet', { timeout: 5000 });
  const couplets = await page.locator('.couplet').count();
  console.log('offline couplets', couplets);
  if (couplets !== 7) failed = true;
} catch (err) {
  console.error(err.message);
  failed = true;
} finally {
  await browser.close();
}
console.log(failed ? 'FAIL' : 'PASS');
process.exit(failed ? 1 : 0);
