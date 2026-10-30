// Which poems have songs, from Ganjoor's music index (/api/sung). A book page
// marks those poems and can narrow its list down to them; a poet page says
// how many of each book's poems have songs and links to the songs page
// (/songs), which lists every sung poem with the same filters plus a poet.
import { h } from './dom.js';
import { faDigits } from './format.js';
import { api } from './api.js';
import { PLATFORM_NAMES } from './songs.js';

const NOTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3z" fill="currentColor"/></svg>';

// Static, trusted markup only; never API data.
export function note() {
  const t = document.createElement('template');
  t.innerHTML = NOTE;
  return t.content.firstChild;
}

let index = null;

// One fetch per visit, shared by every page; a failure is forgotten so the
// next page can try again. Each poem maps to its tracks: who sings it, on
// which platform, and whether it plays here (in the docked player).
export function sungIndex() {
  index ??= fetch(api('/api/sung'))
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then(({ singers, platforms, poems, titles, poets }) => {
      const track = ([s, p, play]) => ({ singer: singers[s] ?? null, platform: platforms[p], playable: play === 1 });
      return {
        tracks: new Map(Object.entries(poems).map(([path, list]) => [path, list.map(track)])),
        titles,
        poets,
      };
    })
    .catch((err) => {
      console.error(err);
      index = null;
      return null;
    });
  return index;
}

// The filter lives in the URL (`?songs`, `?songs=<singer>`, `&via=<platform>`,
// `&play`, and on /songs `&poet=/hafez`), so going back from a poem (or
// reloading) keeps the narrowed list.
const FILTER_PARAM = 'songs';
const PLATFORM_PARAM = 'via';
const PLAY_PARAM = 'play';
const POET_PARAM = 'poet';
// «شنیدن» labels a link on the poem page; as a list entry it means "others".
const PLATFORMS = { ...PLATFORM_NAMES, other: 'سایر' };
// The songs page holds thousands of poems; show them a page at a time.
const PAGE = 200;

function markTitle(tracks) {
  const singers = [...new Set(tracks.map((t) => t.singer).filter(Boolean))];
  if (singers.length === 0) return 'ترانه شده';
  const named = singers.slice(0, 3).join('، ');
  return `ترانه شده با صدای ${named}${singers.length > 3 ? ' و دیگران' : ''}`;
}

// A <select> whose options are the values found in the rows, most poems
// first; refill() recounts them for the other choices. null when there is
// only one value, so nothing to choose between.
function picker({ cls, label, all, values, name }) {
  if (values.size < 2) return null;
  const select = h('select', { class: `${cls}-select` });
  const wrap = h('label', { class: `${cls}-filter`, hidden: true }, label, select);
  const refill = (counts, chosen) => {
    if (chosen && !counts.has(chosen)) counts.set(chosen, 0);
    select.replaceChildren(
      h('option', { value: '' }, all),
      ...[...counts]
        .sort(([a, n], [b, m]) => m - n || name(a).localeCompare(name(b), 'fa'))
        .map(([value, n]) => h('option', { value, dir: 'auto' }, `${name(value)} (${faDigits(n)})`)),
    );
    select.value = chosen;
  };
  return { select, label: wrap, refill };
}

// Poems per value of `key` among `rows`; a poem counts once per value.
function countBy(rows, key) {
  const counts = new Map();
  for (const r of rows) {
    const seen = new Set(key === 'poet' ? [r.poet] : r.tracks.map((t) => t[key]).filter(Boolean));
    for (const value of seen) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
}

// The filter bar over `list`, whose `rows` are { li, tracks, poet? }. On a
// book page it starts with a «فقط شعرهای ترانه‌شده» toggle; on the songs page
// (`always`) it is always on, adds a poet list and shows a page at a time.
export function songFilters(rows, list, { always = false, poets = null } = {}) {
  const state = { on: always, poet: '', singer: '', platform: '', playable: false, shown: PAGE };
  // One track must meet every choice: "Shajarian on Spotify" is one recording.
  const matches = (r, { skip = '', playable = state.playable } = {}) =>
    (skip === 'poet' || !state.poet || r.poet === state.poet) &&
    r.tracks.some(
      (t) =>
        (skip === 'singer' || !state.singer || t.singer === state.singer) &&
        (skip === 'platform' || !state.platform || t.platform === state.platform) &&
        (!playable || t.playable),
    );

  const toggle = always
    ? null
    : h(
        'button',
        { type: 'button', class: 'sung-filter', 'aria-pressed': 'false' },
        note(),
        `فقط شعرهای ترانه‌شده (${faDigits(rows.length)})`,
      );
  const pickers = {
    poet: poets && picker({ cls: 'poet', label: 'سخنور:', all: 'همهٔ سخنوران', values: countBy(rows, 'poet'), name: (v) => poets[v] || v }),
    singer: picker({ cls: 'singer', label: 'خواننده:', all: 'همهٔ خواننده‌ها', values: countBy(rows, 'singer'), name: (v) => v }),
    platform: picker({
      cls: 'platform',
      label: 'سرویس:',
      all: 'همهٔ سرویس‌ها',
      values: countBy(rows, 'platform'),
      name: (v) => PLATFORMS[v] || PLATFORMS.other,
    }),
  };
  // Songs that play right here, in the docked player, rather than as links out.
  const playButton = rows.some((r) => r.tracks.some((t) => t.playable))
    ? h('button', { type: 'button', class: 'play-filter', 'aria-pressed': 'false', hidden: true })
    : null;
  // Banan's Golha songs, say, aren't on Spotify: a combination can leave nothing.
  const none = h('p', { class: 'sung-none', hidden: true }, 'هیچ شعری با این انتخاب پیدا نشد.');
  const more = always ? h('button', { type: 'button', class: 'more-btn', hidden: true }) : null;
  const summary = always ? h('p', { class: 'songs-summary' }) : null;
  list.after(...[none, more].filter(Boolean));

  const apply = () => {
    const found = rows.filter((r) => matches(r));
    const visible = new Set((always ? found.slice(0, state.shown) : found).map((r) => r.li));
    // Every item, not only the sung rows: a book also lists poems without songs.
    for (const li of list.children) li.hidden = state.on && !visible.has(li);
    none.hidden = !state.on || found.length > 0;
    toggle?.setAttribute('aria-pressed', String(state.on));
    for (const [key, p] of Object.entries(pickers)) {
      if (!p) continue;
      p.label.hidden = !state.on;
      p.refill(
        countBy(
          rows.filter((r) => matches(r, { skip: key })),
          key,
        ),
        state[key],
      );
    }
    if (playButton) {
      playButton.hidden = !state.on;
      playButton.setAttribute('aria-pressed', String(state.playable));
      playButton.replaceChildren(note(), `قابل پخش (${faDigits(rows.filter((r) => matches(r, { playable: true })).length)})`);
    }
    if (always) {
      summary.textContent = `شعرهای ترانه‌شده با این انتخاب: ${faDigits(found.length)}`;
      const left = found.length - visible.size;
      more.hidden = left <= 0;
      more.textContent = `نمایش بیشتر (${faDigits(left)} شعر دیگر)`;
    }
    const parts = state.on ? [state.singer ? `${FILTER_PARAM}=${encodeURIComponent(state.singer)}` : FILTER_PARAM] : [];
    if (state.on && state.poet) parts.push(`${POET_PARAM}=${encodeURIComponent(state.poet)}`);
    if (state.on && state.platform) parts.push(`${PLATFORM_PARAM}=${encodeURIComponent(state.platform)}`);
    if (state.on && state.playable) parts.push(PLAY_PARAM);
    history.replaceState(history.state, '', location.pathname + (parts.length ? `?${parts.join('&')}` : ''));
  };
  const choose = (change) => {
    Object.assign(state, change, { shown: PAGE });
    apply();
  };
  toggle?.addEventListener('click', () =>
    choose(state.on ? { on: false, poet: '', singer: '', platform: '', playable: false } : { on: true }),
  );
  playButton?.addEventListener('click', () => choose({ playable: !state.playable }));
  for (const [key, p] of Object.entries(pickers)) p?.select.addEventListener('change', () => choose({ [key]: p.select.value }));
  more?.addEventListener('click', () => {
    state.shown += PAGE;
    apply();
  });

  const params = new URLSearchParams(location.search);
  if (always || params.has(FILTER_PARAM)) {
    state.on = true;
    const known = (key, value) => Boolean(value) && Boolean(pickers[key]) && countBy(rows, key).has(value);
    for (const [key, param] of [
      ['singer', FILTER_PARAM],
      ['platform', PLATFORM_PARAM],
      ['poet', POET_PARAM],
    ]) {
      if (known(key, params.get(param))) state[key] = params.get(param);
    }
    state.playable = Boolean(playButton) && params.has(PLAY_PARAM);
  }
  apply();
  return h(
    'div',
    { class: 'sung-tools' },
    toggle,
    pickers.poet?.label,
    pickers.singer?.label,
    pickers.platform?.label,
    playButton,
    summary,
  );
}

// Called after a category renders. Songs are an extra: without the index the
// page simply stays as it is.
export async function markSung({ root, isCurrent }) {
  const sung = await sungIndex();
  if (!sung || !isCurrent()) return;

  for (const a of root.querySelectorAll('.books a')) {
    const prefix = `${a.getAttribute('href')}/`;
    let n = 0;
    for (const p of sung.tracks.keys()) if (p.startsWith(prefix)) n++;
    if (n === 0) continue;
    a.append(h('span', { class: 'sung-count', title: `شعرهای ترانه‌شدهٔ این بخش: ${faDigits(n)}` }, note(), faDigits(n)));
  }

  // A poet's own page: every sung poem of theirs, across books, is one tap away.
  const poet = location.pathname.match(/^\/[^/]+$/)?.[0];
  if (poet) {
    let n = 0;
    for (const p of sung.tracks.keys()) if (p.startsWith(`${poet}/`)) n++;
    const name = sung.poets[poet] || root.querySelector('h1')?.textContent;
    if (n > 0) {
      root
        .querySelector('h1')
        .after(
          h(
            'a',
            { class: 'songs-link', href: `/songs?${POET_PARAM}=${encodeURIComponent(poet)}` },
            note(),
            `شعرهای ترانه‌شدهٔ ${name} (${faDigits(n)})`,
          ),
        );
    }
  }

  const list = root.querySelector('.poems');
  if (!list) return;
  const rows = [];
  for (const a of list.querySelectorAll('a')) {
    const tracks = sung.tracks.get(a.getAttribute('href'));
    if (!tracks) continue;
    const li = a.parentElement;
    li.classList.add('sung');
    const title = markTitle(tracks);
    a.querySelector('.poem-title').append(h('span', { class: 'sung-mark', title }, note(), h('span', { class: 'sr' }, title)));
    rows.push({ li, tracks });
  }
  if (rows.length === 0) return;
  list.before(songFilters(rows, list));
}

// The songs page: every sung poem, by poet, with the filters always on.
export function songsView({ isCurrent }) {
  const list = h('ul', { class: 'poems all-songs' });
  const body = h('div', {}, h('p', { class: 'state' }, 'در حال بارگذاری…'));
  sungIndex().then((sung) => {
    if (!isCurrent()) return;
    if (!sung) {
      body.replaceChildren(h('p', { class: 'state' }, 'فهرست ترانه‌ها از گنجور نرسید؛ کمی بعد دوباره تلاش کنید.'));
      return;
    }
    const poetOf = (path) => path.slice(0, path.indexOf('/', 1));
    const name = (poet) => sung.poets[poet] || poet;
    // Within a poet, the book with the most sung poems first (Hafez's
    // ghazals, not «اشعار منتسب» by the alphabet), then by poem number.
    const bookOf = (path) => path.slice(0, path.lastIndexOf('/'));
    const perBook = new Map();
    for (const path of sung.tracks.keys()) perBook.set(bookOf(path), (perBook.get(bookOf(path)) || 0) + 1);
    const rows = [...sung.tracks]
      .map(([path, tracks]) => ({ path, tracks, poet: poetOf(path), book: bookOf(path), title: sung.titles[path] || path }))
      .sort(
        (a, b) =>
          name(a.poet).localeCompare(name(b.poet), 'fa') ||
          perBook.get(b.book) - perBook.get(a.book) ||
          a.book.localeCompare(b.book) ||
          a.title.localeCompare(b.title, 'fa', { numeric: true }),
      )
      .map((r) => {
        const parts = r.title.split(' » ');
        r.li = h(
          'li',
          { class: 'sung' },
          h(
            'a',
            { href: r.path },
            h('span', { class: 'poem-title' }, parts.at(-1)),
            h('span', { class: 'excerpt' }, [name(r.poet), ...parts.slice(0, -1)].join(' » ')),
          ),
        );
        return r;
      });
    list.replaceChildren(...rows.map((r) => r.li));
    body.replaceChildren(list);
    list.before(songFilters(rows, list, { always: true, poets: sung.poets }));
  });
  return h(
    'section',
    { class: 'songs-page' },
    h('h1', {}, 'ترانه‌ها'),
    h('p', { class: 'lede' }, 'شعرهایی که خوانندگان ترانه کرده‌اند، از نمایهٔ موسیقی گنجور. سخنور، خواننده یا سرویس را انتخاب کنید.'),
    body,
  );
}
