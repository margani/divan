// Screenshots every page type at desktop and phone width in light and dark,
// and fails if a page scrolls sideways or rendered no content.
// Usage: npm run dev (in another shell), then npm run shots [-- base-url]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] || 'http://localhost:8788';
const pages = [
  ['home', '/'],
  ['poet', '/hafez'],
  ['book', '/hafez/ghazal'],
  ['ghazal', '/hafez/ghazal/sh1'],
  ['tarjiband', '/hatef/divan-hatef/tarjeeband'],
  ['tarane', '/rahi/tarane/sh20'],
  ['missing', '/no-such-poet'],
  ['about', '/about'],
  ['songs', '/songs'],
  ['favorites', '/favorites'],
];
const viewports = [
  ['desktop', { width: 1280, height: 900 }],
  ['phone', { width: 390, height: 844 }],
];
const schemes = ['light', 'dark'];

mkdirSync('shots', { recursive: true });
const browser = await chromium.launch();
const problems = [];
let checks = 0;
try {
  for (const [vpName, viewport] of viewports) {
    for (const scheme of schemes) {
      const ctx = await browser.newContext({ viewport, colorScheme: scheme, serviceWorkers: 'block' });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => problems.push(`${vpName}/${scheme}: page error ${e.message}`));
      for (const [name, path] of pages) {
        await page.goto(base + path);
        await page.waitForFunction(() => !document.querySelector('#app .state') || document.querySelector('#app .state p')?.textContent !== 'در حال بارگذاری…');
        await page.evaluate(() => document.fonts.ready);
        const m = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          text: document.querySelector('#app').innerText.trim().length,
          junk: /\[object |\bnull\b|\bfalse\b|\bundefined\b/.test(document.querySelector('#app').innerText),
          poetLinks: document.querySelectorAll('.poets a').length,
          bookLinks: document.querySelectorAll('.books a').length,
          poemLinks: document.querySelectorAll('.poems a').length,
          couplets: document.querySelectorAll('.couplet').length,
          stanzas: document.querySelectorAll('.stanza-title').length,
          credit: document.querySelector('.credit a[href^="https://ganjoor.net/"]')?.href || null,
        }));
        checks++;
        if (m.overflow > 0) problems.push(`${name} ${vpName}/${scheme}: scrolls sideways by ${m.overflow}px`);
        if (m.text === 0) problems.push(`${name} ${vpName}/${scheme}: empty page`);
        if (m.junk) problems.push(`${name} ${vpName}/${scheme}: stringified values in the page text`);
        if (name === 'home' && m.poetLinks < 200) problems.push(`home: only ${m.poetLinks} poet links`);
        if (name === 'poet' && m.bookLinks === 0) problems.push('poet: no book links');
        if (name === 'book' && m.poemLinks !== 495) problems.push(`book: ${m.poemLinks} poem links, expected 495`);
        if (['ghazal', 'tarjiband', 'tarane'].includes(name)) {
          if (m.couplets === 0) problems.push(`${name}: no couplets`);
          if (m.credit !== `https://ganjoor.net${path}`) problems.push(`${name}: credit link is ${m.credit}`);
        }
        if (name === 'tarjiband' && m.stanzas !== 5) problems.push(`tarjiband: ${m.stanzas} stanza headings, expected 5`);
        await page.screenshot({ path: `shots/${name}-${vpName}-${scheme}.png`, fullPage: false });
        console.log(`${name}-${vpName}-${scheme}`, JSON.stringify(m));
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
const expected = pages.length * viewports.length * schemes.length;
console.log(`${checks}/${expected} pages checked`);
if (checks !== expected) problems.push('not every page was checked');
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
