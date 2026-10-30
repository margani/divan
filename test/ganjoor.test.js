import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handle, isValidPath, shapeCat, shapePoem, shapeSongs, shapeSung, SHAPE_VERSION } from '../lib/ganjoor.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

test('isValidPath accepts Ganjoor slugs and rejects everything else', () => {
  assert.ok(isValidPath('/hafez'));
  assert.ok(isValidPath('/rahi/tarane/sh20'));
  for (const bad of ['', 'hafez', '/', '/a/../b', '/a?b=1', 'https://evil.example/x', '/حافظ', '//x']) {
    assert.equal(isValidPath(bad), false, bad);
  }
});

test('shapePoem keeps positions and breadcrumb and drops AI summaries', () => {
  const poem = shapePoem(fixture('poem-tarjeeband.json'));
  assert.equal(poem.type, 'poem');
  assert.equal(poem.url, '/hatef/divan-hatef/tarjeeband');
  assert.equal(poem.poet.name, 'هاتف اصفهانی');
  assert.deepEqual(
    poem.breadcrumb.map((b) => b.url),
    ['/hatef', '/hatef/divan-hatef'],
  );
  assert.ok(poem.verses.length > 0);
  const counts = {};
  for (const v of poem.verses) counts[v.p] = (counts[v.p] || 0) + 1;
  assert.deepEqual(counts, { right: 87, left: 87, center1: 5, center2: 5 });
  assert.ok(!JSON.stringify(poem).includes('هوش مصنوعی'));
});

test('shapeCat lists children and poems; bio only on the poet root', () => {
  const root = shapeCat(fixture('cat-hafez.json'));
  assert.equal(root.url, '/hafez');
  assert.ok(root.description);
  assert.ok(root.children.length > 0);
  assert.ok(root.children.some((c) => c.url === '/hafez/ghazal'));

  const ghazal = shapeCat(fixture('cat-hafez-ghazal.json'));
  assert.equal(ghazal.description, null);
  assert.deepEqual(ghazal.breadcrumb.map((b) => b.url), ['/hafez']);
  assert.equal(ghazal.poems.length, 3);
  assert.equal(ghazal.poems[0].url, '/hafez/ghazal/sh1');
});

function stubFetch(routes) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const hit = Object.entries(routes).find(([prefix]) => url.startsWith(prefix));
    if (!hit) return new Response('', { status: 404 });
    const [, body] = hit;
    if (typeof body === 'number') return new Response('', { status: body });
    return new Response(JSON.stringify(body), { status: 200 });
  };
  fn.calls = calls;
  return fn;
}

function memoryCache() {
  const store = new Map();
  return {
    store,
    async match(req) {
      const r = store.get(req.url);
      return r && r.clone();
    },
    async put(req, res) {
      store.set(req.url, res);
    },
  };
}

const UP = 'https://api.ganjoor.net/api/ganjoor';

test('a category path falls back from poem to cat and is cached once', async () => {
  const fetchFn = stubFetch({ [`${UP}/cat?`]: fixture('cat-hafez-ghazal.json') });
  const cache = memoryCache();
  const pending = [];
  const ctx = { cache, waitUntil: (p) => pending.push(p), fetchFn };

  const req = () => new Request('https://divan.test/api/page?url=/hafez/ghazal&junk=1');
  const first = await handle(req(), ctx);
  await Promise.all(pending);
  assert.equal(first.status, 200);
  assert.equal((await first.json()).type, 'cat');
  assert.equal(fetchFn.calls.length, 2);
  assert.match(first.headers.get('cache-control'), /s-maxage=86400/);

  const second = await handle(req(), ctx);
  assert.equal((await second.json()).url, '/hafez/ghazal');
  assert.equal(fetchFn.calls.length, 2, 'second read must come from the cache');
  assert.deepEqual([...cache.store.keys()], [`https://divan.test/api/page?url=%2Fhafez%2Fghazal&shape=${SHAPE_VERSION}`]);
});

test('bad paths never reach Ganjoor', async () => {
  const fetchFn = stubFetch({});
  const res = await handle(new Request('https://divan.test/api/page?url=https://evil.example/'), {
    cache: null,
    waitUntil() {},
    fetchFn,
  });
  assert.equal(res.status, 400);
  assert.equal(fetchFn.calls.length, 0);
});

test('unknown paths give 404, upstream failures give an uncached 502', async () => {
  const missing = await handle(new Request('https://divan.test/api/page?url=/nope'), {
    cache: null,
    waitUntil() {},
    fetchFn: stubFetch({}),
  });
  assert.equal(missing.status, 404);

  const cache = memoryCache();
  const broken = await handle(new Request('https://divan.test/api/poets'), {
    cache,
    waitUntil: () => {},
    fetchFn: stubFetch({ [`${UP}/poets`]: 503 }),
  });
  assert.equal(broken.status, 502);
  assert.equal(cache.store.size, 0);
});

test('non-GET is refused', async () => {
  const res = await handle(new Request('https://divan.test/api/poets', { method: 'POST' }), {
    cache: null,
    waitUntil() {},
  });
  assert.equal(res.status, 405);
});

test('the poem request asks Ganjoor for verses', async () => {
  // Ganjoor returns an empty verse list unless verseDetails=true; the first
  // local run showed every poem blank because of it.
  const { poemUrl } = await import('../lib/ganjoor.js');
  const q = new URL(poemUrl('/hafez/ghazal/sh1')).searchParams;
  assert.equal(q.get('verseDetails'), 'true');
  assert.equal(q.get('comments'), 'false');
});

test('responses say whether they came from the edge cache', async () => {
  const fetchFn = stubFetch({ [`${UP}/poets`]: [] });
  const cache = memoryCache();
  const pending = [];
  const ctx = { cache, waitUntil: (p) => pending.push(p), fetchFn };
  const first = await handle(new Request('https://divan.test/api/poets'), ctx);
  await Promise.all(pending);
  assert.equal(first.headers.get('x-divan-cache'), 'miss');
  const second = await handle(new Request('https://divan.test/api/poets'), ctx);
  assert.equal(second.headers.get('x-divan-cache'), 'hit');
});

test('/api/version reports the deployed commit and is never cached', async () => {
  const cache = memoryCache();
  const res = await handle(new Request('https://divan.test/api/version'), {
    cache,
    waitUntil() {},
    fetchFn: stubFetch({}),
    version: 'abc1234',
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { commit: 'abc1234' });
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(cache.store.size, 0);
});

test('shapePoem keeps each verse order so recitation sync can find it', () => {
  const poem = shapePoem(fixture('poem-tarjeeband.json'));
  assert.deepEqual(poem.verses.slice(0, 3).map((v) => v.o), [1, 2, 3]);
});

test('recitations: only normal ones, trimmed, credited to the reciter', async () => {
  const fetchFn = stubFetch({ [`${UP}/poem/2130/recitations`]: fixture('recitations-2130.json') });
  const res = await handle(new Request('https://divan.test/api/recitations?poem=2130'), {
    cache: null,
    waitUntil() {},
    fetchFn,
  });
  assert.equal(res.status, 200);
  const list = await res.json();
  assert.deepEqual(list.map((r) => r.id), [2840, 3879, 2935]);
  assert.deepEqual(list[0], {
    id: 2840,
    artist: 'فریدون فرح‌اندوز',
    artistUrl: 'https://t.me/fereidounfarahandouz',
    mp3: 'https://i.ganjoor.net/a/2130-ff.mp3',
    synced: true,
  });
});

test('sync: [verse order, start ms] pairs from Ganjoor', async () => {
  const fetchFn = stubFetch({ 'https://api.ganjoor.net/api/audio/verses/2840': fixture('sync-2840.json') });
  const res = await handle(new Request('https://divan.test/api/sync?id=2840'), { cache: null, waitUntil() {}, fetchFn });
  const pairs = await res.json();
  assert.equal(pairs.length, 15);
  assert.deepEqual(pairs.slice(0, 3), [[0, 0], [1, 0], [2, 7386]]);
});

test('recitation and sync ids must be numbers', async () => {
  const fetchFn = stubFetch({});
  for (const u of ['/api/recitations?poem=abc', '/api/sync?id=1/../2', '/api/sync']) {
    const res = await handle(new Request('https://divan.test' + u), { cache: null, waitUntil() {}, fetchFn });
    assert.equal(res.status, 400, u);
  }
  assert.equal(fetchFn.calls.length, 0);
});

test('the cache key keeps the parameter each endpoint uses', async () => {
  const fetchFn = stubFetch({ 'https://api.ganjoor.net/api/audio/verses/2840': fixture('sync-2840.json') });
  const cache = memoryCache();
  const pending = [];
  await handle(new Request('https://divan.test/api/sync?id=2840&x=1'), { cache, waitUntil: (p) => pending.push(p), fetchFn });
  await Promise.all(pending);
  assert.deepEqual([...cache.store.keys()], [`https://divan.test/api/sync?id=2840&shape=${SHAPE_VERSION}`]);
});

test('cache keys carry the payload version, so a new shape never meets old entries', async () => {
  const { SHAPE_VERSION } = await import('../lib/ganjoor.js');
  assert.ok(Number.isInteger(SHAPE_VERSION) && SHAPE_VERSION >= 2);
  const fetchFn = stubFetch({ [`${UP}/poets`]: [] });
  const cache = memoryCache();
  const pending = [];
  await handle(new Request('https://divan.test/api/poets'), { cache, waitUntil: (p) => pending.push(p), fetchFn });
  await Promise.all(pending);
  assert.deepEqual([...cache.store.keys()], [`https://divan.test/api/poets?shape=${SHAPE_VERSION}`]);
});

test('poets carry the full name for search, and the payload version moved on', async () => {
  const { shapePoets } = await import('../lib/ganjoor.js');
  const [p] = shapePoets([{ name: 'جلال الدین محمد مولوی', nickname: 'مولانا', fullUrl: '/moulavi', published: true }]);
  assert.equal(p.name, 'مولانا');
  assert.equal(p.fullName, 'جلال الدین محمد مولوی');
  assert.equal(SHAPE_VERSION, 6);
});

test('songs: one row per singer, players only for Spotify and YouTube', async () => {
  const fetchFn = stubFetch({ [`${UP}/poem/2130/songs?approved=true`]: fixture('songs-2130.json') });
  const res = await handle(new Request('https://divan.test/api/songs?poem=2130'), { cache: null, waitUntil() {}, fetchFn });
  assert.equal(res.status, 200);
  const rows = await res.json();
  assert.ok(rows.length > 10);
  // Iraj Bastami is listed on BeepTunes and Spotify: one row, two links.
  const bastami = rows.filter((r) => r.artist === 'ایرج بسطامی');
  assert.equal(bastami.length, 1);
  assert.deepEqual(bastami[0].links.map((l) => l.platform).sort(), ['beeptunes', 'spotify']);
  assert.equal(
    bastami[0].links.find((l) => l.platform === 'spotify').embed,
    'https://open.spotify.com/embed/track/0pmLo97lqhhifohbQCw0bX',
  );
  assert.equal(bastami[0].links.find((l) => l.platform === 'beeptunes').embed, null);
  // Playable rows come first.
  const firstLinkOnly = rows.findIndex((r) => !r.links.some((l) => l.embed));
  assert.ok(firstLinkOnly > 0 && rows.slice(firstLinkOnly).every((r) => !r.links.some((l) => l.embed)));
  // Golha: singer read out of the description, link upgraded to https.
  const golha = rows.find((r) => r.links[0].platform === 'golha');
  assert.equal(golha.artist, 'عهدیه');
  assert.equal(golha.links[0].url, 'https://www.golha.co.uk/fa/programme/1479');
  assert.deepEqual([golha.from, golha.to], ['۲۶:۳۱', '۲۷:۱۲']);
});

test('songs: a Golha entry names its singer and song', () => {
  const [row] = shapeSongs(fixture('songs-140965.json'));
  assert.equal(row.artist, 'غلامحسین بنان');
  assert.equal(row.title, 'کاروان');
  assert.equal(row.album, 'گلهای رنگارنگ » شمارهٔ ۲۱۷');
  assert.deepEqual([row.from, row.to], ['۱۱:۳۱', '۲۰:۱۴']);
});

test('songs: only real YouTube and Spotify ids are framed; broken links dropped', () => {
  const t = (id, trackUrl, extra = {}) => ({ id, trackType: 4, artistName: `a${id}`, trackName: 't', albumName: '', trackUrl, ...extra });
  const rows = shapeSongs([
    t(1, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    t(2, 'https://youtu.be/dQw4w9WgXcQ'),
    t(3, 'https://music.youtube.com/watch?v=dQw4w9WgXcQ&feature=share'),
    t(4, 'https://www.youtube.com/watch?v=bad"><script>'),
    t(5, 'https://open.spotify.com/album/0pmLo97lqhhifohbQCw0bX'),
    t(6, 'javascript:alert(1)'),
    t(7, 'https://open.spotify.com/track/0pmLo97lqhhifohbQCw0bX', { brokenLink: true }),
    t(8, 'https://soundcloud.com/x/y'),
  ]);
  const by = Object.fromEntries(rows.map((r) => [r.artist, r.links[0]]));
  for (const a of ['a1', 'a2', 'a3']) assert.equal(by[a].embed, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', a);
  assert.equal(by.a4.embed, null);
  assert.equal(by.a5.embed, null);
  assert.equal(by.a6, undefined);
  assert.equal(by.a7, undefined);
  assert.equal(by.a8.platform, 'soundcloud');
});

test('songs ids must be numbers', async () => {
  const fetchFn = stubFetch({});
  const res = await handle(new Request('https://divan.test/api/songs?poem=1;2'), { cache: null, waitUntil() {}, fetchFn });
  assert.equal(res.status, 400);
  assert.equal(fetchFn.calls.length, 0);
});

test('sung: every poem in Ganjoor music index, once, from one cached request', async () => {
  const fetchFn = stubFetch({ [`${UP}/page?url=%2Fmundex%2Fbypoet`]: fixture('mundex-bypoet.json') });
  const cache = memoryCache();
  const pending = [];
  const ctx = { cache, waitUntil: (p) => pending.push(p), fetchFn };
  const res = await handle(new Request('https://divan.test/api/sung?poem=1'), ctx);
  await Promise.all(pending);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('cache-control'), /s-maxage=86400/);
  const poems = Object.keys((await res.json()).poems);
  assert.ok(poems.includes('/rahi/tarane/sh20'));
  assert.ok(poems.includes('/hafez/ghazal/sh1'));
  assert.ok(poems.every((p) => p.startsWith('/rahi/') || p.startsWith('/hafez/ghazal/')));
  await handle(new Request('https://divan.test/api/sung'), ctx);
  assert.equal(fetchFn.calls.length, 1, 'second read must come from the cache');
  assert.deepEqual([...cache.store.keys()], [`https://divan.test/api/sung?shape=${SHAPE_VERSION}`]);
});

test('sung: only Ganjoor poem paths survive, and an empty index is an error', () => {
  const li = (href) => `<li><p>\n<a href="${href}">x</a> در y</p></li>`;
  const html = [li('/hafez/ghazal/sh1'), li('https://evil.example/x'), li('/a/../b'), li('javascript:alert(1)'), li('/hafez/ghazal/sh1')].join('\n');
  assert.deepEqual(Object.keys(shapeSung({ htmlText: html }).poems), ['/hafez/ghazal/sh1']);
  assert.throws(() => shapeSung({ htmlText: '<p>nothing</p>' }));
  assert.throws(() => shapeSung(null));
});

test('sung: Ganjoor failing gives an uncached 502', async () => {
  const cache = memoryCache();
  const res = await handle(new Request('https://divan.test/api/sung'), {
    cache,
    waitUntil() {},
    fetchFn: stubFetch({ [`${UP}/page?url=%2Fmundex%2Fbypoet`]: { htmlText: '<p>under maintenance</p>' } }),
  });
  assert.equal(res.status, 502);
  assert.equal(cache.store.size, 0);
});

// Each poem's tracks as [{ singer, platform, playable }], names resolved.
function tracksOf({ singers, platforms, poems }, path) {
  return (poems[path] || []).map(([s, p, play]) => ({ singer: singers[s] ?? null, platform: platforms[p], playable: play === 1 }));
}

test('sung: each poem names its singers, Golha ones too', () => {
  const sung = shapeSung(fixture('mundex-bypoet.json'));
  const of = (path) => tracksOf(sung, path).map((t) => t.singer);
  // Golha: «خواننده ترانه: بنان، غلامحسین», surname first.
  assert.ok(of('/rahi/tarane/sh20').includes('غلامحسین بنان'), of('/rahi/tarane/sh20').join(' | '));
  assert.ok(of('/hafez/ghazal/sh1').includes('ایرج بسطامی'));
  assert.ok(of('/hafez/ghazal/sh1').includes('محمدرضا شجریان'));
  assert.equal(new Set(sung.singers).size, sung.singers.length, 'each singer once');
  for (const list of Object.values(sung.poems)) {
    const keys = list.map((t) => t.join());
    assert.equal(new Set(keys).size, keys.length, 'a singer, platform and playability once per poem');
  }
});

test('sung: singer names are decoded, folded and ranked by tracks', () => {
  const li = (href, body) => `<li><p>\n<a href="${href}">x</a> در ${body}</p></li>`;
  const html = [
    li('/a/b/sh1', 'Jojo Mayer &amp; Nerve  » al » <a href="https://open.spotify.com/track/x">t</a>'),
    li('/a/b/sh1', 'علي  اكبري  » al » <a href="https://x.example">t</a>'),
    li('/a/b/sh2', '\u200Fعلی اکبری  » al » <a href="https://x.example">t</a>'),
    li('/a/b/sh3', 'گلها  » برگ سبز » شمارهٔ ۳ » <a href="http://www.golha.co.uk/fa/programme/25">(۲۴:۵۲ - ۲۵:۱۶) گوینده: پیمان، اسدالله</a>'),
    li('/a/b/sh4', 'گلها  » گلهای جاویدان » <a href="http://www.golha.co.uk/fa/programme/325">نوازندگان: عبادی، احمد (‎سه‌تار) خواننده آواز: مرضیه سراینده شعر آواز: حافظ</a>'),
  ].join('\n');
  const sung = shapeSung({ htmlText: html });
  assert.deepEqual(sung.singers, ['علی اکبری', 'Jojo Mayer & Nerve', 'مرضیه']);
  assert.deepEqual(tracksOf(sung, '/a/b/sh1').map((t) => t.singer), ['Jojo Mayer & Nerve', 'علی اکبری']);
  assert.deepEqual(tracksOf(sung, '/a/b/sh3'), [{ singer: null, platform: 'golha', playable: false }], 'a Golha track with no singer still marks the poem');
  assert.deepEqual(tracksOf(sung, '/a/b/sh4').map((t) => t.singer), ['مرضیه']);
});

test('sung: each track says its platform and whether it plays in the page', () => {
  const li = (href, body) => `<li><p>\n<a href="${href}">x</a> در ${body}</p></li>`;
  const html = [
    li('/a/b/sh1', 'الف  » al » <a href="https://open.spotify.com/track/1YFexazC7gxVdidvCyqZ3X">t</a>'),
    li('/a/b/sh1', 'الف  » al » <a href="https://beeptunes.com/track/551739260">t</a>'),
    li('/a/b/sh2', 'ب  » al » <a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ&amp;list=x">t</a>'),
    li('/a/b/sh3', 'الف  » al » <a href="https://open.spotify.com/track/not-an-id">t</a>'),
    li('/a/b/sh4', 'گلها  » برگ سبز » <a href="http://www.golha.co.uk/fa/programme/25">خواننده آواز: مرضیه</a>'),
    li('/a/b/sh5', 'ج  » al » <a href="https://music.apple.com/x">t</a>'),
    li('/a/b/sh5', 'ج  » al » <a href="ftp://odd.example/x">t</a>'),
  ].join('\n');
  const sung = shapeSung({ htmlText: html });
  assert.deepEqual(tracksOf(sung, '/a/b/sh1'), [
    { singer: 'الف', platform: 'spotify', playable: true },
    { singer: 'الف', platform: 'beeptunes', playable: false },
  ]);
  assert.deepEqual(tracksOf(sung, '/a/b/sh2'), [{ singer: 'ب', platform: 'youtube', playable: true }], 'entity-encoded YouTube link');
  assert.deepEqual(tracksOf(sung, '/a/b/sh3'), [{ singer: 'الف', platform: 'spotify', playable: false }], 'a malformed Spotify id is not playable');
  assert.deepEqual(tracksOf(sung, '/a/b/sh4'), [{ singer: 'مرضیه', platform: 'golha', playable: false }], 'Golha is a link out');
  assert.deepEqual(tracksOf(sung, '/a/b/sh5'), [
    { singer: 'ج', platform: 'apple', playable: false },
    { singer: 'ج', platform: 'other', playable: false },
  ]);

  const real = shapeSung(fixture('mundex-bypoet.json'));
  const hafez = tracksOf(real, '/hafez/ghazal/sh1');
  assert.ok(hafez.some((t) => t.platform === 'spotify' && t.playable));
  assert.ok(real.platforms.includes('golha') && real.platforms.includes('beeptunes'));
  assert.ok(Object.values(real.poems).flat().every(([s, p, play]) => s >= -1 && s < real.singers.length && real.platforms[p] && (play === 0 || play === 1)));
});

test('sung: each poem has its title and each poet a name, for the songs page', () => {
  const sung = shapeSung(fixture('mundex-bypoet.json'));
  assert.equal(sung.titles['/rahi/tarane/sh20'], 'ترانه‌ها و نغمه‌ها » شمارهٔ ۲۰ - کاروان دشتی');
  assert.equal(sung.titles['/hafez/ghazal/sh1'], 'غزلیات » غزل شمارهٔ ۱');
  assert.equal(sung.poets['/hafez'], 'حافظ');
  assert.equal(sung.poets['/rahi'], 'رهی معیری');
  assert.deepEqual(Object.keys(sung.titles).sort(), Object.keys(sung.poems).sort());

  const li = (href, title) => `<li><p>\n<a href="${href}">${title}</a> در الف  » al » <a href="https://x.example">t</a></p></li>`;
  const odd = shapeSung({ htmlText: [li('/a/b/sh1', 'تنها عنوان'), li('/a/b/sh2', 'شاعر » کتاب &amp; دفتر » شعر &lt;۲&gt;')].join('\n') });
  assert.equal(odd.titles['/a/b/sh1'], 'تنها عنوان');
  assert.equal(odd.titles['/a/b/sh2'], 'کتاب & دفتر » شعر <۲>');
  assert.equal(odd.poets['/a'], 'شاعر');
});
