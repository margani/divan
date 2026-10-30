// Shapes api.ganjoor.net responses into the small payloads the reader needs,
// and serves them with edge caching so Ganjoor sees roughly one request per
// page per day, not one per reader.

export const UPSTREAM = 'https://api.ganjoor.net/api/ganjoor';

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
  return json({ error: 'unknown-endpoint' }, 404, MISSING);
}

export async function handle(request, { cache, waitUntil, fetchFn = fetch }) {
  if (request.method !== 'GET') return json({ error: 'method' }, 405, 'no-store');
  const url = new URL(request.url);
  const apiPath = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');
  // Only the parameter we use is part of the cache key, so `?url=/x&junk=1`
  // can't fill the cache with copies.
  const key = new URL(url.origin + url.pathname);
  if (url.searchParams.has('url')) key.searchParams.set('url', url.searchParams.get('url'));
  const keyReq = new Request(key.toString());

  const hit = cache && (await cache.match(keyReq));
  if (hit) return hit;

  let res;
  try {
    res = await resolve(apiPath, key.searchParams, fetchFn);
  } catch (err) {
    console.error(err);
    return json({ error: 'upstream' }, 502, 'no-store');
  }
  if (cache) waitUntil(cache.put(keyReq, res.clone()));
  return res;
}
