// Shapes api.ganjoor.net responses into the small payloads the reader needs,
// and serves them with edge caching so Ganjoor sees roughly one request per
// page per day, not one per reader.

export const UPSTREAM = 'https://api.ganjoor.net/api/ganjoor';

// Bump whenever a payload's shape changes. It is part of every edge cache
// key: v2 shipped verse orders, but poems cached by v1 kept being served
// without them for days, so highlighting silently failed.
export const SHAPE_VERSION = 3;

// Ganjoor paths are ASCII slugs such as /hafez/ghazal/sh1. Anything else is
// rejected before it reaches Ganjoor, so the proxy can't be used as an open relay.
const PATH_RE = /^(\/[A-Za-z0-9_-]{1,80}){1,8}$/;

export function isValidPath(path) {
  return typeof path === 'string' && PATH_RE.test(path);
}

// The poem endpoint returns comments, recitations, images and songs unless
// told not to; the reader needs none of them in v1.
export function poemUrl(path) {
  const q = new URLSearchParams({
    url: path,
    catInfo: 'true',
    catPoems: 'false',
    rhymes: 'false',
    recitations: 'false',
    images: 'false',
    songs: 'false',
    comments: 'false',
    // Despite the name, false drops the verses entirely, not just details.
    verseDetails: 'true',
    navigation: 'false',
  });
  return `${UPSTREAM}/poem?${q}`;
}

export function catUrl(path) {
  const q = new URLSearchParams({ url: path, poems: 'true', mainSections: 'false' });
  return `${UPSTREAM}/cat?${q}`;
}

const POSITIONS = {
  0: 'right',
  1: 'left',
  2: 'center1',
  3: 'center2',
  4: 'single',
  5: 'comment',
  '-1': 'prose',
};

function shapePoet(poet) {
  if (!poet) return null;
  return { name: poet.nickname || poet.name, fullName: poet.name, url: poet.fullUrl };
}

function link(cat) {
  return { title: cat.title, url: cat.fullUrl };
}

export function shapePoets(poets) {
  return poets
    .filter((p) => p.published !== false)
    .map((p) => ({
      name: p.nickname || p.name,
      // Searched too: readers know Rumi as مولوی, Ganjoor lists him as مولانا.
      fullName: p.name && p.name !== p.nickname ? p.name.trim() : null,
      url: p.fullUrl,
      // Lunar hijri years; 0 means unknown on Ganjoor.
      birth: p.birthYearInLHijri || null,
      death: p.deathYearInLHijri || null,
    }));
}

export function shapePoem(poem) {
  const cat = poem.category?.cat;
  const breadcrumb = cat ? [...(cat.ancestors || []).map(link), link(cat)] : [];
  return {
    type: 'poem',
    id: poem.id,
    title: poem.title,
    url: poem.fullUrl,
    poet: shapePoet(poem.category?.poet),
    breadcrumb,
    // coupletSummary is left out on purpose: many are AI-written paraphrases,
    // not part of the poem.
    verses: (poem.verses || [])
      .slice()
      .sort((a, b) => a.vOrder - b.vOrder)
      .map((v) => ({
        p: POSITIONS[v.versePosition] || 'single',
        t: v.text,
        c: v.coupletIndex,
        // Recitation sync points at verses by this order.
        o: v.vOrder,
      })),
  };
}

export function shapeCat({ poet, cat }) {
  const isRoot = !cat.ancestors || cat.ancestors.length === 0;
  return {
    type: 'cat',
    id: cat.id,
    title: cat.title,
    url: cat.fullUrl,
    poet: shapePoet(poet),
    // The poet's biography only belongs on the poet's own page.
    description: isRoot ? poet?.description || null : null,
    breadcrumb: (cat.ancestors || []).map(link),
    children: (cat.children || []).map(link),
    poems: (cat.poems || []).map((p) => ({
      title: p.title,
      url: `${cat.fullUrl}/${p.urlSlug}`,
      excerpt: p.excerpt || '',
    })),
  };
}

// RecitationType in GanjoorService: 0 normal, 1 commentary. Commentaries
// talk about the poem rather than read it, so they can't follow the verses.
const NORMAL_RECITATION = 0;

export function shapeRecitations(list) {
  return list
    .filter((r) => r.recitationType === NORMAL_RECITATION && r.mp3Url)
    .map((r) => ({
      id: r.id,
      artist: r.audioArtist,
      artistUrl: r.audioArtistUrl || null,
      mp3: r.mp3Url,
      synced: r.inSyncWithText === true,
    }));
}

// Ganjoor already corrects old files' timing and maps each entry to the
// verse's VOrder (0 is the title); pairs keep the payload small.
export function shapeSync(list) {
  return list.map((s) => [s.verseOrder, s.audioStartMilliseconds]);
}

const ID_RE = /^[0-9]{1,9}$/;

const FRESH = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';
const MISSING = 'public, max-age=600, s-maxage=3600';

function json(body, status, cacheControl) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheControl,
    },
  });
}

async function upstream(fetchFn, url) {
  const res = await fetchFn(url, {
    headers: { accept: 'application/json', 'user-agent': 'divan (+https://divan.whosane.dev)' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Ganjoor answered ${res.status} for ${url}`);
  return res.json();
}

// Resolves /api/poets and /api/page?url=… without caching; `fetchFn` is
// injected so tests can stub Ganjoor.
export async function resolve(apiPath, searchParams, fetchFn = fetch) {
  if (apiPath === 'poets') {
    const poets = await upstream(fetchFn, `${UPSTREAM}/poets`);
    return json(shapePoets(poets || []), 200, FRESH);
  }
  if (apiPath === 'page') {
    const path = searchParams.get('url');
    if (!isValidPath(path)) return json({ error: 'bad-path' }, 400, MISSING);
    // A path is either a poem or a category; Ganjoor 404s the wrong one.
    const poem = await upstream(fetchFn, poemUrl(path));
    if (poem) return json(shapePoem(poem), 200, FRESH);
    const cat = await upstream(fetchFn, catUrl(path));
    if (cat) return json(shapeCat(cat), 200, FRESH);
    return json({ error: 'not-found' }, 404, MISSING);
  }
  if (apiPath === 'recitations') {
    const id = searchParams.get('poem');
    if (!ID_RE.test(id ?? '')) return json({ error: 'bad-id' }, 400, MISSING);
    const list = await upstream(fetchFn, `${UPSTREAM}/poem/${id}/recitations`);
    return json(shapeRecitations(list || []), 200, FRESH);
  }
  if (apiPath === 'sync') {
    const id = searchParams.get('id');
    if (!ID_RE.test(id ?? '')) return json({ error: 'bad-id' }, 400, MISSING);
    const list = await upstream(fetchFn, `https://api.ganjoor.net/api/audio/verses/${id}`);
    if (!list) return json({ error: 'not-found' }, 404, MISSING);
    return json(shapeSync(list), 200, FRESH);
  }
  return json({ error: 'unknown-endpoint' }, 404, MISSING);
}

// Each endpoint's one parameter is the whole cache key, so extra query
// parameters can't fill the cache with copies.
const KEY_PARAMS = { page: 'url', recitations: 'poem', sync: 'id' };

export async function handle(request, { cache, waitUntil, fetchFn = fetch, version = null }) {
  if (request.method !== 'GET') return json({ error: 'method' }, 405, 'no-store');
  const url = new URL(request.url);
  const apiPath = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');
  // Lets a deploy be checked against the merged commit.
  if (apiPath === 'version') return json({ commit: version }, 200, 'no-store');
  const key = new URL(url.origin + url.pathname);
  const param = KEY_PARAMS[apiPath];
  if (param && url.searchParams.has(param)) key.searchParams.set(param, url.searchParams.get(param));
  key.searchParams.set('shape', String(SHAPE_VERSION));
  const keyReq = new Request(key.toString());

  const hit = cache && (await cache.match(keyReq));
  // The Cache API leaves no trace of its own, so say it: this is how we can
  // check that readers aren't each costing Ganjoor a request.
  if (hit) return withCacheHeader(hit, 'hit');

  let res;
  try {
    res = await resolve(apiPath, key.searchParams, fetchFn);
  } catch (err) {
    console.error(err);
    return json({ error: 'upstream' }, 502, 'no-store');
  }
  if (cache) waitUntil(cache.put(keyReq, res.clone()));
  return withCacheHeader(res, 'miss');
}

function withCacheHeader(res, state) {
  const out = new Response(res.body, res);
  out.headers.set('x-divan-cache', state);
  return out;
}
