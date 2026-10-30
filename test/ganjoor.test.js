import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handle, isValidPath, shapeCat, shapePoem } from '../lib/ganjoor.js';

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
  assert.deepEqual([...cache.store.keys()], ['https://divan.test/api/page?url=%2Fhafez%2Fghazal']);
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
