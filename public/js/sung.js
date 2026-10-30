// Which poems have songs, from Ganjoor's music index (/api/sung). A book page
// marks those poems, can narrow its list down to them, and a poet page says
// how many of each book's poems have songs.
import { h } from './dom.js';
import { faDigits } from './format.js';
import { api } from './api.js';
import { PLATFORM_NAMES } from './songs.js';

const NOTE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3z" fill="currentColor"/></svg>';

// Static, trusted markup only; never API data.
function note() {
  const t = document.createElement('template');
  t.innerHTML = NOTE;
  return t.content.firstChild;
}

let index = null;

// One fetch per visit, shared by every page; a failure is forgotten so the
// next page can try again. Each poem maps to its tracks: who sings it, on
// which platform, and whether it plays here (in the docked player).
function sungIndex() {
  index ??= fetch(api('/api/sung'))
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then(({ singers, platforms, poems }) => {
      const track = ([s, p, play]) => ({ singer: singers[s] ?? null, platform: platforms[p], playable: play === 1 });
      return new Map(Object.entries(poems).map(([path, list]) => [path, list.map(track)]));
    })
    .catch((err) => {
      console.error(err);
      index = null;
      return null;
    });
  return index;
}

// The filter lives in the URL (`?songs`, `?songs=<singer>`, `&via=<platform>`,
// `&play`), so going back from a poem (or reloading) keeps the narrowed list.
const FILTER_PARAM = 'songs';
const PLATFORM_PARAM = 'via';
const PLAY_PARAM = 'play';
// «شنیدن» labels a link on the poem page; as a list entry it means "others".
const PLATFORMS = { ...PLATFORM_NAMES, other: 'سایر' };

function markTitle(tracks) {
  const singers = [...new Set(tracks.map((t) => t.singer).filter(Boolean))];
  if (singers.length === 0) return 'ترانه شده';
  const named = singers.slice(0, 3).join('، ');
  return `ترانه شده با صدای ${named}${singers.length > 3 ? ' و دیگران' : ''}`;
}

// A <select> of the values in this book, most poems first; null when there
// is nothing to choose between.
function picker(cls, labelCls, label, all, counts, name) {
  if (counts.size < 2) return null;
  const select = h(
    'select',
    { class: cls },
    h('option', { value: '' }, all),
    [...counts]
      .sort(([a, n], [b, m]) => m - n || name(a).localeCompare(name(b), 'fa'))
      .map(([value, n]) => h('option', { value, dir: 'auto' }, `${name(value)} (${faDigits(n)})`)),
  );
  return { select, label: h('label', { class: labelCls, hidden: true }, label, select) };
}

function poemCounts(rows, key) {
  const counts = new Map();
  for (const { tracks } of rows) {
    for (const value of new Set(tracks.map((t) => t[key]).filter(Boolean))) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
}

function singerFilter(rows, list) {
  const state = { on: false, singer: '', platform: '', playable: false };
  // One track must meet every choice: "Shajarian on Spotify" is one recording.
  const matches = (r, playable = state.playable) =>
    r.tracks.some(
      (t) => (!state.singer || t.singer === state.singer) && (!state.platform || t.platform === state.platform) && (!playable || t.playable),
    );

  const button = h('button', { type: 'button', class: 'sung-filter', 'aria-pressed': 'false' }, note(), `فقط شعرهای ترانه‌شده (${faDigits(rows.length)})`);
  const singers = picker('singer-select', 'singer-filter', 'خواننده:', 'همهٔ خواننده‌ها', poemCounts(rows, 'singer'), (v) => v);
  const platforms = picker('platform-select', 'platform-filter', 'سرویس:', 'همهٔ سرویس‌ها', poemCounts(rows, 'platform'), (v) => PLATFORMS[v] || PLATFORMS.other);
  // Songs that play right here, in the docked player, rather than as links out.
  const playButton = rows.some((r) => r.tracks.some((t) => t.playable))
    ? h('button', { type: 'button', class: 'play-filter', 'aria-pressed': 'false', hidden: true })
    : null;

  // Banan's Golha songs, say, aren't on Spotify: a combination can leave nothing.
  const none = h('p', { class: 'sung-none', hidden: true }, 'هیچ شعری با این انتخاب پیدا نشد.');
  list.after(none);

  const apply = () => {
    const shown = new Set(rows.filter((r) => matches(r)).map((r) => r.li));
    for (const li of list.children) li.hidden = state.on && !shown.has(li);
    none.hidden = !state.on || shown.size > 0;
    button.setAttribute('aria-pressed', String(state.on));
    for (const [p, value] of [[singers, state.singer], [platforms, state.platform]]) {
      if (!p) continue;
      p.label.hidden = !state.on;
      p.select.value = value;
    }
    if (playButton) {
      playButton.hidden = !state.on;
      playButton.setAttribute('aria-pressed', String(state.playable));
      playButton.replaceChildren(note(), `قابل پخش (${faDigits(rows.filter((r) => matches(r, true)).length)})`);
    }
    const parts = state.on ? [state.singer ? `${FILTER_PARAM}=${encodeURIComponent(state.singer)}` : FILTER_PARAM] : [];
    if (state.on && state.platform) parts.push(`${PLATFORM_PARAM}=${encodeURIComponent(state.platform)}`);
    if (state.on && state.playable) parts.push(PLAY_PARAM);
    history.replaceState(history.state, '', location.pathname + (parts.length ? `?${parts.join('&')}` : ''));
  };
  button.addEventListener('click', () => {
    state.on = !state.on;
    if (!state.on) Object.assign(state, { singer: '', platform: '', playable: false });
    apply();
  });
  playButton?.addEventListener('click', () => {
    state.playable = !state.playable;
    apply();
  });
  singers?.select.addEventListener('change', () => {
    state.singer = singers.select.value;
    apply();
  });
  platforms?.select.addEventListener('change', () => {
    state.platform = platforms.select.value;
    apply();
  });

  const params = new URLSearchParams(location.search);
  if (params.has(FILTER_PARAM)) {
    state.on = true;
    const known = (p, value) => p && [...p.select.options].some((o) => o.value === value && value !== '');
    if (known(singers, params.get(FILTER_PARAM))) state.singer = params.get(FILTER_PARAM);
    if (known(platforms, params.get(PLATFORM_PARAM))) state.platform = params.get(PLATFORM_PARAM);
    state.playable = Boolean(playButton) && params.has(PLAY_PARAM);
  }
  apply();
  return h('div', { class: 'sung-tools' }, button, singers?.label, platforms?.label, playButton);
}

// Called after a category renders. Songs are an extra: without the index the
// page simply stays as it is.
export async function markSung({ root, isCurrent }) {
  const sung = await sungIndex();
  if (!sung || !isCurrent()) return;

  for (const a of root.querySelectorAll('.books a')) {
    const prefix = `${a.getAttribute('href')}/`;
    let n = 0;
    for (const p of sung.keys()) if (p.startsWith(prefix)) n++;
    if (n === 0) continue;
    a.append(h('span', { class: 'sung-count', title: `شعرهای ترانه‌شدهٔ این بخش: ${faDigits(n)}` }, note(), faDigits(n)));
  }

  const list = root.querySelector('.poems');
  if (!list) return;
  const rows = [];
  for (const a of list.querySelectorAll('a')) {
    const tracks = sung.get(a.getAttribute('href'));
    if (!tracks) continue;
    const li = a.parentElement;
    li.classList.add('sung');
    const title = markTitle(tracks);
    a.querySelector('.poem-title').append(h('span', { class: 'sung-mark', title }, note(), h('span', { class: 'sr' }, title)));
    rows.push({ li, tracks });
  }
  if (rows.length === 0) return;
  list.before(singerFilter(rows, list));
}
