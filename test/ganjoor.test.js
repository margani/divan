import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handle, isValidPath, shapeCat, shapePoem, SHAPE_VERSION } from '../lib/ganjoor.js';

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
