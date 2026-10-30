// Checks the "poems with songs" filter: a book marks the poems Ganjoor's music
// index lists, «فقط شعرهای ترانه‌شده» narrows the list to them (and to one
// singer, a platform, or songs that play here) and survives going back from a poem
// and a reload, a poet page counts each book's sung
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
// «اسپاتیفای (۱۳)» -> 13
const faCount = (text) => Number(text.match(/\(([۰-۹]+)\)$/)?.[1].replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
// Rows of this book with one track matching every given choice.
const expected = (page, choice) =>
  page.evaluate(async ({ singer, platform }) => {
    const tracks = await window.sungTracks();
    const all = [...document.querySelectorAll('.poems li a')].map((a) => a.getAttribute('href'));
    const ok = (path) => (tracks[path] || []).some((t) => (!singer || t.singer === singer) && (!platform || t.platform === platform));
    const shown = [...document.querySelectorAll('.poems li:not([hidden]) a')].map((a) => a.getAttribute('href'));
    return { want: all.filter(ok).length, wrong: shown.filter((path) => !ok(path)) };
  }, choice);

try {
  for (const [vp, viewport] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 900 }]]) {
    for (const scheme of ['light', 'dark']) {
      const tag = `${vp}/${scheme}`;
      const ctx = await browser.newContext({ viewport, colorScheme: scheme, serviceWorkers: 'block' });
      // The index as the checks need it: each poem's tracks, names resolved.
      await ctx.addInitScript(() => {
        window.sungTracks = async () => {
          const { singers, platforms, poems } = await (await fetch('/api/sung')).json();
          return Object.fromEntries(
            Object.entries(poems).map(([path, list]) => [path, list.map(([s, p, play]) => ({ singer: singers[s] ?? null, platform: platforms[p], playable: play === 1 }))]),
          );
        };
      });
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
      expect(!(await page.locator('.singer-filter').isVisible()), `${tag}: singer list shown before the filter is on`);
      expect(!(await page.locator('.play-filter').isVisible()), `${tag}: «قابل پخش» shown before the filter is on`);
      await page.screenshot({ path: `shots/sung-book-${vp}-${scheme}.png` });

      await filter.click();
      expect((await visible(page).count()) === marked, `${tag}: ${await visible(page).count()} rows shown, ${marked} sung`);
      expect((await page.locator('.poems li:visible:not(.sung)').count()) === 0, `${tag}: a poem without songs still shown`);
      expect(new URL(page.url()).search === '?songs', `${tag}: filter not in the URL (${page.url()})`);
      expect((await filter.getAttribute('aria-pressed')) === 'true', `${tag}: filter not marked pressed`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow <= 0, `${tag}: scrolls sideways by ${overflow}px`);
      await page.screenshot({ path: `shots/sung-filtered-${vp}-${scheme}.png` });

      // Pick a singer: only that singer's poems stay, and the choice survives
      // going back from a poem and a reload.
      const picker = page.locator('.singer-select');
      expect(await picker.isVisible(), `${tag}: no singer list once the filter is on`);
      const options = await picker.locator('option').evaluateAll((os) => os.map((o) => ({ value: o.value, text: o.textContent })));
      expect(options.length > 3 && options[0].value === '' && persian(options[0].text), `${tag}: singer options ${options.length}`);
      const { value: singer, text } = options[1];
      const count = Number(text.match(/\(([۰-۹]+)\)$/)?.[1].replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
      await picker.selectOption(singer);
      const singerRows = visible(page);
      expect((await singerRows.count()) === count && count > 0, `${tag}: «${singer}» shows ${await singerRows.count()} poems, its option says ${count}`);
      const wrong = await page.evaluate(async (name) => {
        const tracks = await window.sungTracks();
        const shown = [...document.querySelectorAll('.poems li:not([hidden]) a')].map((a) => a.getAttribute('href'));
        return shown.filter((path) => !(tracks[path] || []).some((t) => t.singer === name));
      }, singer);
      expect(wrong.length === 0, `${tag}: shown but not sung by «${singer}»: ${wrong.join(' ')}`);
      expect(new URL(page.url()).searchParams.get('songs') === singer, `${tag}: singer not in the URL (${page.url()})`);
      const pickerOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(pickerOverflow <= 0, `${tag}: singer list makes the page scroll sideways by ${pickerOverflow}px`);
      await page.screenshot({ path: `shots/sung-singer-${vp}-${scheme}.png` });
      await singerRows.first().locator('a').click();
      await page.waitForSelector('.poem-head');
      await page.goBack();
      await page.locator('.sung-filter[aria-pressed="true"]').waitFor();
      expect((await picker.inputValue()) === singer && (await visible(page).count()) === count, `${tag}: singer lost after going back`);
      await page.reload();
      await page.locator('.sung-filter[aria-pressed="true"]').waitFor();
      expect((await picker.inputValue()) === singer && (await visible(page).count()) === count, `${tag}: singer lost after a reload`);
      await picker.selectOption('');
      expect((await visible(page).count()) === marked && new URL(page.url()).search === '?songs', `${tag}: «همهٔ خواننده‌ها» didn't bring back every sung poem`);

      // «سرویس»: only poems with a track on that platform; with a singer, one
      // track must be both («Banan on Spotify» is one recording).
      const via = page.locator('.platform-select');
      expect(await via.isVisible(), `${tag}: no platform list once the filter is on`);
      const vias = await via.locator('option').evaluateAll((os) => os.map((o) => ({ value: o.value, text: o.textContent })));
      expect(vias.length > 2 && vias[0].value === '' && vias.every((o) => persian(o.text)), `${tag}: platform options ${vias.map((o) => o.text).join(' | ')}`);
      await via.selectOption('spotify');
      const onSpotify = await expected(page, { platform: 'spotify' });
      const spotifyLabel = faCount(vias.find((o) => o.value === 'spotify')?.text || '');
      expect(onSpotify.want > 0 && (await visible(page).count()) === onSpotify.want && spotifyLabel === onSpotify.want, `${tag}: Spotify shows ${await visible(page).count()}, label ${spotifyLabel}, index ${onSpotify.want}`);
      expect(onSpotify.wrong.length === 0, `${tag}: shown without a Spotify track: ${onSpotify.wrong.join(' ')}`);
      expect(new URL(page.url()).searchParams.get('via') === 'spotify', `${tag}: platform not in the URL (${page.url()})`);
      await picker.selectOption(singer);
      const pair = await expected(page, { singer, platform: 'spotify' });
      const bothShown = await visible(page).count();
      expect(bothShown === pair.want && pair.wrong.length === 0 && (await page.locator('.sung-none').isVisible()) === (pair.want === 0), `${tag}: «${singer}» on Spotify shows ${bothShown}, index ${pair.want}, wrong ${pair.wrong.join(' ')}`);
      await page.reload();
      await page.locator('.sung-filter[aria-pressed="true"]').waitFor();
      expect((await via.inputValue()) === 'spotify' && (await picker.inputValue()) === singer && (await visible(page).count()) === bothShown, `${tag}: singer + platform lost after a reload`);
      await page.screenshot({ path: `shots/sung-platform-${vp}-${scheme}.png` });
      await via.selectOption('');
      await picker.selectOption('');
      expect((await visible(page).count()) === marked && new URL(page.url()).search === '?songs', `${tag}: clearing singer and platform didn't bring back every sung poem`);

      // «قابل پخش»: only poems with a Spotify or YouTube song, alone and with
      // a singer; the label's count is what stays on screen.
      const play = page.locator('.play-filter');
      const playCount = async () => Number((await play.textContent()).match(/\(([۰-۹]+)\)$/)?.[1].replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
      const notPlayable = (name) =>
        page.evaluate(async (who) => {
          const tracks = await window.sungTracks();
          const shown = [...document.querySelectorAll('.poems li:not([hidden]) a')].map((a) => a.getAttribute('href'));
          return shown.filter((path) => !(tracks[path] || []).some((t) => t.playable && (!who || t.singer === who)));
        }, name);
      expect(persian(await play.textContent()) && (await play.isVisible()), `${tag}: no «قابل پخش» chip`);
      await play.click();
      const playable = await playCount();
      expect(playable > 0 && playable < marked && (await visible(page).count()) === playable, `${tag}: «قابل پخش» shows ${await visible(page).count()}, label ${playable}`);
      expect((await notPlayable('')).length === 0, `${tag}: a shown poem has nothing playable`);
      expect(new URL(page.url()).searchParams.has('play'), `${tag}: «قابل پخش» not in the URL`);
      const playSinger = await page.evaluate(async () => {
        const tracks = await window.sungTracks();
        const here = [...document.querySelectorAll('.poems li a')].map((a) => a.getAttribute('href'));
        const opts = [...document.querySelectorAll('.singer-select option')].map((o) => o.value).filter(Boolean);
        return opts.find((name) => here.some((p) => (tracks[p] || []).some((t) => t.playable && t.singer === name)));
      });
      await picker.selectOption(playSinger);
      const both = await playCount();
      expect(both > 0 && (await visible(page).count()) === both && (await notPlayable(playSinger)).length === 0, `${tag}: «${playSinger}» + «قابل پخش»: ${await visible(page).count()} shown, label ${both}`);
      await page.reload();
      await page.locator('.play-filter[aria-pressed="true"]').waitFor();
      expect((await picker.inputValue()) === playSinger && (await visible(page).count()) === both, `${tag}: singer + «قابل پخش» lost after a reload`);
      await page.screenshot({ path: `shots/sung-play-${vp}-${scheme}.png` });
      // The filter and the poem page's «پخش» button must agree.
      await visible(page).first().locator('a').click();
      await page.waitForSelector('.songs-list .song');
      const playRow = page.locator('.songs-list .song').filter({ has: page.locator('.song-artist', { hasText: playSinger }) });
      expect((await playRow.locator('.song-play').count()) > 0, `${tag}: «${playSinger}» filtered as playable, but the poem has no «پخش» for them`);
      await page.goBack();
      await page.locator('.play-filter[aria-pressed="true"]').waitFor();
      const silent = await page.evaluate(async () => {
        const tracks = await window.sungTracks();
        const here = [...document.querySelectorAll('.poems li.sung a')].map((a) => a.getAttribute('href'));
        const opts = [...document.querySelectorAll('.singer-select option')].map((o) => o.value).filter(Boolean);
        return opts.find((name) => !here.some((p) => (tracks[p] || []).some((t) => t.playable && t.singer === name)));
      });
      if (silent) {
        await picker.selectOption(silent);
        expect((await visible(page).count()) === 0 && (await page.locator('.sung-none').isVisible()), `${tag}: «${silent}» has nothing playable but no message`);
      } else {
        expect(false, `${tag}: every singer here has a playable song; can't test the empty message`);
      }
      await picker.selectOption('');
      await play.click();
      expect((await visible(page).count()) === marked && !new URL(page.url()).searchParams.has('play') && !(await page.locator('.sung-none').isVisible()), `${tag}: turning «قابل پخش» off didn't restore the list`);

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
      expect(!(await page.locator('.singer-filter').isVisible()), `${tag}: singer list still shown with the filter off`);

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
      const indexRead = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/sung');
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
    await page.route((url) => url.pathname === '/api/sung', (r) => r.fulfill({ status: 502, body: '{"error":"upstream"}' }));
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
const EXPECTED = 4 * 49 + 3;
console.log(`${checks} checks ran`);
if (checks < EXPECTED) problems.push(`only ${checks}/${EXPECTED} checks ran`);
console.log(problems.length ? `FAIL\n${problems.join('\n')}` : 'PASS');
process.exit(problems.length ? 1 : 0);
