// Which poems have songs, from Ganjoor's music index (/api/sung). A book page
// marks those poems, can narrow its list down to them, and a poet page says
// how many of each book's poems have songs.
import { h } from './dom.js';
import { faDigits } from './format.js';

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
// next page can try again. Each poem maps to its singers, and to those whose
// song plays here (Spotify or YouTube in the docked player).
function sungIndex() {
  index ??= fetch('/api/sung')
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then(({ singers, poems, playable = {} }) => {
      const names = (ids) => ids.map((i) => singers[i]);
      return new Map(
        Object.entries(poems).map(([path, ids]) => [path, { singers: names(ids), playable: new Set(names(playable[path] || [])) }]),
      );
    })
    .catch((err) => {
      console.error(err);
      index = null;
      return null;
    });
  return index;
}

// The filter lives in the URL (`?songs`, `?songs=<singer>`, plus `&play`),
// so going back from a poem (or reloading) returns to the same narrowed list.
const FILTER_PARAM = 'songs';
const PLAY_PARAM = 'play';

function markTitle(singers) {
  if (singers.length === 0) return 'ترانه شده';
  const named = singers.slice(0, 3).join('، ');
  return `ترانه شده با صدای ${named}${singers.length > 3 ? ' و دیگران' : ''}`;
}

function singerFilter(rows, list) {
  const counts = new Map();
  for (const { singers } of rows) for (const name of singers) counts.set(name, (counts.get(name) || 0) + 1);
  const state = { on: false, singer: '', playable: false };
  const bySinger = (r) => !state.singer || r.singers.includes(state.singer);
  const plays = (r) => (state.singer ? r.playable.has(state.singer) : r.playable.size > 0);

  const button = h('button', { type: 'button', class: 'sung-filter', 'aria-pressed': 'false' }, note(), `فقط شعرهای ترانه‌شده (${faDigits(rows.length)})`);
  const select = h(
    'select',
    { class: 'singer-select' },
    h('option', { value: '' }, 'همهٔ خواننده‌ها'),
    [...counts]
      .sort(([a, n], [b, m]) => m - n || a.localeCompare(b, 'fa'))
      .map(([name, n]) => h('option', { value: name, dir: 'auto' }, `${name} (${faDigits(n)})`)),
  );
  // With one singer (or none named) there is nothing to choose between.
  const picker = counts.size > 1 ? h('label', { class: 'singer-filter', hidden: true }, 'خواننده:', select) : null;
  // Songs that play right here, in the docked player, rather than as links out.
  const playButton = rows.some((r) => r.playable.size > 0)
    ? h('button', { type: 'button', class: 'play-filter', 'aria-pressed': 'false', hidden: true })
    : null;

  // Banan's Golha songs, say, are links out: «قابل پخش» can leave nothing.
  const none = h('p', { class: 'sung-none', hidden: true }, 'هیچ اجرای قابل پخشی با این انتخاب پیدا نشد.');
  list.after(none);

  const apply = () => {
    const shown = new Set(rows.filter((r) => bySinger(r) && (!state.playable || plays(r))).map((r) => r.li));
    for (const li of list.children) li.hidden = state.on && !shown.has(li);
    none.hidden = !state.on || shown.size > 0;
    button.setAttribute('aria-pressed', String(state.on));
    if (picker) picker.hidden = !state.on;
    select.value = state.singer;
    if (playButton) {
      playButton.hidden = !state.on;
      playButton.setAttribute('aria-pressed', String(state.playable));
      playButton.replaceChildren(note(), `قابل پخش (${faDigits(rows.filter((r) => bySinger(r) && plays(r)).length)})`);
    }
    const parts = state.on ? [state.singer ? `${FILTER_PARAM}=${encodeURIComponent(state.singer)}` : FILTER_PARAM] : [];
    if (state.on && state.playable) parts.push(PLAY_PARAM);
    history.replaceState(history.state, '', location.pathname + (parts.length ? `?${parts.join('&')}` : ''));
  };
  button.addEventListener('click', () => {
    state.on = !state.on;
    if (!state.on) {
      state.singer = '';
      state.playable = false;
    }
    apply();
  });
  playButton?.addEventListener('click', () => {
    state.playable = !state.playable;
    apply();
  });
  select.addEventListener('change', () => {
    state.singer = select.value;
    apply();
  });

  const params = new URLSearchParams(location.search);
  if (params.has(FILTER_PARAM)) {
    state.on = true;
    if (counts.has(params.get(FILTER_PARAM))) state.singer = params.get(FILTER_PARAM);
    state.playable = Boolean(playButton) && params.has(PLAY_PARAM);
  }
  apply();
  return h('div', { class: 'sung-tools' }, button, picker, playButton);
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
    const entry = sung.get(a.getAttribute('href'));
    if (!entry) continue;
    const { singers, playable } = entry;
    const li = a.parentElement;
    li.classList.add('sung');
    const title = markTitle(singers);
    a.querySelector('.poem-title').append(h('span', { class: 'sung-mark', title }, note(), h('span', { class: 'sr' }, title)));
    rows.push({ li, singers, playable });
  }
  if (rows.length === 0) return;
  list.before(singerFilter(rows, list));
}
