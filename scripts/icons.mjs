// Renders the PNG app icons from public/icons/icon.svg; run after changing it.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const out = (name) => new URL(`../public/icons/${name}`, import.meta.url).pathname;
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const shots = [
    ['icon-192.png', 192, 0, true],
    ['icon-512.png', 512, 0, true],
    ['apple-touch-icon.png', 180, 0, false],
    // Maskable icons are cropped to a circle by the OS: full-bleed background,
    // motif kept inside the central safe zone.
    ['icon-maskable-512.png', 512, 0.1, false],
  ];
  for (const [name, size, pad, rounded] of shots) {
    const body = rounded ? svg : svg.replace('rx="112"', 'rx="0"');
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<body style="margin:0;background:${rounded ? 'transparent' : '#8b5a24'}">
         <div style="width:${size}px;height:${size}px;padding:${size * pad}px;box-sizing:border-box">${body.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
       </body>`,
    );
    await page.screenshot({ path: out(name), omitBackground: rounded });
    console.log('wrote', name);
  }
} finally {
  await browser.close();
}
