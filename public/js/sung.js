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
// next page can try again.
function sungPoems() {
  index ??= fetch('/api/sung')
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then((data) => new Set(data.poems))
    .catch((err) => {
      console.error(err);
      index = null;
      return null;
    });
  return index;
}

// The filter lives in the URL, so going back from a poem (or reloading)
// returns to the same narrowed list.
const FILTER_PARAM = 'songs';

function setFilter(list, button, on) {
  list.classList.toggle('only-sung', on);
  button.setAttribute('aria-pressed', String(on));
  history.replaceState(history.state, '', on ? `${location.pathname}?${FILTER_PARAM}` : location.pathname);
}

// Called after a category renders. Songs are an extra: without the index the
// page simply stays as it is.
export async function markSung({ root, isCurrent }) {
  const sung = await sungPoems();
  if (!sung || !isCurrent()) return;

  for (const a of root.querySelectorAll('.books a')) {
    const prefix = `${a.getAttribute('href')}/`;
    let n = 0;
    for (const p of sung) if (p.startsWith(prefix)) n++;
    if (n === 0) continue;
    a.append(h('span', { class: 'sung-count', title: `شعرهای ترانه‌شدهٔ این بخش: ${faDigits(n)}` }, note(), faDigits(n)));
  }

  const list = root.querySelector('.poems');
  if (!list) return;
  let n = 0;
  for (const a of list.querySelectorAll('a')) {
    if (!sung.has(a.getAttribute('href'))) continue;
    n++;
    a.parentElement.classList.add('sung');
    a.querySelector('.poem-title').append(h('span', { class: 'sung-mark', title: 'ترانه شده' }, note(), h('span', { class: 'sr' }, 'ترانه شده')));
  }
  if (n === 0) return;
  const button = h('button', { type: 'button', class: 'sung-filter', 'aria-pressed': 'false' }, note(), `فقط شعرهای ترانه‌شده (${faDigits(n)})`);
  button.addEventListener('click', () => setFilter(list, button, button.getAttribute('aria-pressed') !== 'true'));
  list.before(button);
  if (new URLSearchParams(location.search).has(FILTER_PARAM)) setFilter(list, button, true);
}
