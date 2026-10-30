// Checks the songs list under a poem: Ganjoor's songs appear one row per
// singer, nothing from Spotify or YouTube loads until «پخش» is tapped, the
// docked player then opens (allowed by the CSP) and gives way to a
// recitation, Golha songs name their singer, and a poem with no songs invites
// the reader to add one on Ganjoor.
// Usage: npm run dev (in another shell), then node scripts/songs-check.mjs [base-url]
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
const THIRD_PARTY = /spotify\.com|scdn\.co|youtube|ytimg|googlevideo/;
const persian = (s) => /^[\u0600-\u06FF]/.test(s.trim());

try {
  for (const [vp, viewport] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 900 }]]) {
    for (const scheme of ['light', 'dark']) {
      const tag = `${vp}/${scheme}`;
      const ctx = await browser.newContext({ viewport, colorScheme: scheme, serviceWorkers: 'block' });
      const page = await ctx.newPage();
      const errors = [];
      const thirdParty = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => m.type() === 'error' && /Content Security Policy|Refused to frame/.test(m.text()) && errors.push(m.text()));
      page.on('request', (r) => THIRD_PARTY.test(r.url()) && thirdParty.push(r.url()));

      await page.goto(base + '/hafez/ghazal/sh1');
      await page.waitForSelector('.songs-list .song');
      const rows = page.locator('.songs-list .song');
      const n = await rows.count();
      expect(n > 10, `${tag}: only ${n} songs listed`);
      const bastami = rows.filter({ hasText: 'ایرج بسطامی' });
      expect((await bastami.count()) === 1, `${tag}: Iraj Bastami listed ${await bastami.count()} times`);
      expect((await bastami.locator('.song-link').count()) === 2, `${tag}: Bastami row should link BeepTunes and Spotify`);
      const texts = await page.locator('.songs h2, .songs p, .song-artist').allTextContents();
      expect(texts.length > 0 && texts.every(persian), `${tag}: song text not starting with a Persian letter: ${texts.filter((t) => !persian(t)).join(' | ')}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow <= 0, `${tag}: scrolls sideways by ${overflow}px`);
      await page.locator('.songs').screenshot({ path: `shots/songs-${vp}-${scheme}.png` });
      expect(thirdParty.length === 0, `${tag}: third-party requests before tapping play: ${thirdParty.slice(0, 3).join(' ')}`);

      // Tap play: the Spotify player docks at the bottom.
      await rows.first().locator('.song-play').click();
      const frame = page.locator('.song-dock iframe');
      await frame.waitFor();
      const src = await frame.getAttribute('src');
      expect(/^https:\/\/(open\.spotify\.com\/embed\/track\/|www\.youtube-nocookie\.com\/embed\/)/.test(src), `${tag}: player src ${src}`);
      expect(await rows.first().evaluate((el) => el.classList.contains('playing')), `${tag}: playing row not marked`);
      await page.waitForTimeout(2500);
      const loaded = await frame.evaluate((f) => f.getBoundingClientRect().height);
      expect(loaded >= 80, `${tag}: player only ${loaded}px tall`);
      // The dock must not hide the end of the page.
      const covered = await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
        const dock = document.querySelector('.song-dock').getBoundingClientRect();
        const v = document.querySelector('#version').getBoundingClientRect();
        return v.bottom > dock.top + 1;
      });
      expect(!covered, `${tag}: song player covers the footer`);
      await page.screenshot({ path: `shots/songs-dock-${vp}-${scheme}.png` });

      // A recitation takes over: the song player closes.
      const listen = page.locator('.listen');
      if (await listen.count()) {
        await listen.click();
        expect((await page.locator('.song-dock').count()) === 0, `${tag}: song player still open after starting a recitation`);
        expect((await page.locator('.player').count()) === 1, `${tag}: ${await page.locator('.player').count()} players open`);
      } else {
        expect(false, `${tag}: no recitation button to test the hand-over`);
      }

      // Leaving the poem closes everything.
      await rows.first().locator('.song-play').click();
      await page.locator('.song-dock iframe').waitFor();
      await page.click('.crumbs a >> nth=0');
      await page.waitForSelector('.books, .poems');
      expect((await page.locator('.song-dock').count()) === 0, `${tag}: song player survived navigation`);
      expect(errors.length === 0, `${tag}: errors ${errors.join(' | ')}`);
      await ctx.close();
    }
  }

  // Golha: Banan's «کاروان», a link out (no player), with the time in the programme.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await page.goto(base + '/rahi/tarane/sh20');
    await page.waitForSelector('.songs-list .song');
    const row = page.locator('.songs-list .song').first();
    expect((await row.locator('.song-artist').textContent()) === 'غلامحسین بنان', 'Golha: singer not parsed');
    expect((await row.locator('.song-title').textContent()) === 'کاروان', 'Golha: song name not parsed');
    expect((await row.locator('.song-play').count()) === 0, 'Golha: should be a link, not a player');
    expect((await row.locator('a.song-link').getAttribute('href')) === 'https://www.golha.co.uk/fa/programme/1222', 'Golha: wrong link');
    expect((await row.locator('.song-album').textContent()).includes('۱۱:۳۱'), 'Golha: no time in the programme');
    // replaceChildren stringifies a skipped `cond && node` (CLAUDE.md lessons).
    const junk = (await page.textContent('.songs')).match(/\bfalse\b|\bnull\b|\[object/);
    expect(!junk, `Golha: junk text in the songs section: ${junk?.[0]}`);
    await page.locator('.songs').screenshot({ path: 'shots/songs-golha.png' });
    await ctx.close();
  }

  // No songs yet: an invitation to add one on Ganjoor.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await page.goto(base + '/saadi/divan/ghazals/sh1');
    await page.waitForSelector('.songs-empty');
    const href = await page.locator('.songs-empty a').getAttribute('href');
    expect(/^https:\/\/ganjoor\.net\/golha\?p=\d+$/.test(href), `empty: suggest link ${href}`);
    expect(persian(await page.textContent('.songs-empty')), 'empty: text does not start with a Persian letter');
    await ctx.close();
  }
} catch (err) {
  problems.push(err.message);
} finally {
  await browser.close();
}
console.log(`${checks} checks ran`);
if (checks < 64) problems.push(`only ${checks}/64 checks ran`);
console.log(problems.length ? `FAIL\n${problems.join('\n')}` : 'PASS');
process.exit(problems.length ? 1 : 0);
