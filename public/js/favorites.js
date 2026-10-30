// Favourites («علاقه‌مندی‌ها»): poems and single couplets the reader keeps.
// They live only in this browser (localStorage): Divan has no accounts and
// sends nothing anywhere. A couplet is stored with its text, so the
// favourites page reads offline without fetching its poem.
import { h, nodes } from './dom.js';
import { faDigits } from './format.js';

const KEY = 'divan-favorites';

const HEART =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8.2 3.4 5 6.6 5c2 0 3.4 1.1 4.2 2.4h2.4C14 6.1 15.4 5 17.4 5c3.2 0 5.1 3.2 3.9 6.3-1.8 4.6-9.3 9.2-9.3 9.2z" fill="currentColor"/></svg>';

// Static, trusted markup only; never stored or API data.
export function heart() {
  const t = document.createElement('template');
  t.innerHTML = HEART;
  return t.content.firstChild;
}

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { poems: Array.isArray(data.poems) ? data.poems : [], couplets: Array.isArray(data.couplets) ? data.couplets : [] };
  } catch {
    return { poems: [], couplets: [] };
  }
}

// false when the browser refuses (private mode, storage full), so the button
// can say it didn't work instead of pretending.
function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

function setPoem(poem, on) {
  const data = load();
  data.poems = data.poems.filter((p) => p.url !== poem.url);
  if (on) data.poems.unshift({ url: poem.url, title: poem.title, poet: poem.poet?.name || null, at: Date.now() });
  return save(data);
}

function setCouplet(entry, on) {
  const data = load();
  data.couplets = data.couplets.filter((c) => c.key !== entry.key);
  if (on) data.couplets.unshift({ ...entry, at: Date.now() });
  return save(data);
}

// The selectable unit around a tap: a couplet, a band couplet, or a single
// line of free verse or prose.
const UNIT = '.couplet, .band, .free > p, .stanza > p[data-o]';

function unitLines(unit) {
  return unit.matches('p') ? [unit.textContent] : [...unit.querySelectorAll('p')].map((p) => p.textContent);
}

// The poem head's «♡» toggle and the couplet bar. Recitation tap-to-seek
// (player.js) listens on the same article and keeps working.
export function setupFavorites(poem, { head, article }) {
  const units = [...article.querySelectorAll(UNIT)];
  const keyOf = (unit) => `${poem.url}#${unit.querySelector('[data-o]')?.dataset.o ?? unit.dataset.o ?? `i${units.indexOf(unit)}`}`;
  const saved = () => new Set(load().couplets.map((c) => c.key));
  const markSaved = () => {
    const keys = saved();
    for (const u of units) u.classList.toggle('faved', keys.has(keyOf(u)));
  };

  const poemBtn = h('button', { type: 'button', class: 'fav-poem' });
  const drawPoem = (failed = false) => {
    const on = load().poems.some((p) => p.url === poem.url);
    poemBtn.setAttribute('aria-pressed', String(on));
    poemBtn.replaceChildren(heart(), failed ? 'مرورگر اجازهٔ نگه‌داشتن نداد' : on ? 'در علاقه‌مندی‌ها' : 'افزودن به علاقه‌مندی‌ها');
  };
  poemBtn.addEventListener('click', () => drawPoem(!setPoem(poem, poemBtn.getAttribute('aria-pressed') !== 'true')));
  drawPoem();
  head.append(poemBtn);

  let bar = null;
  let selected = null;
  const close = () => {
    bar?.remove();
    selected?.classList.remove('selected');
    bar = selected = null;
  };
  article.addEventListener('click', (e) => {
    if (e.target.closest('a, button') || window.getSelection()?.toString()) return;
    const unit = e.target.closest(UNIT);
    if (!unit || unit === selected) return close();
    close();
    selected = unit;
    unit.classList.add('selected');
    const key = keyOf(unit);
    const btn = h('button', { type: 'button', class: 'fav-couplet' });
    const draw = (failed = false) => {
      const on = saved().has(key);
      btn.setAttribute('aria-pressed', String(on));
      btn.replaceChildren(
        heart(),
        failed ? 'مرورگر اجازهٔ نگه‌داشتن نداد' : on ? 'برداشتن از علاقه‌مندی‌ها' : 'افزودن این بیت به علاقه‌مندی‌ها',
      );
    };
    btn.addEventListener('click', () => {
      const on = btn.getAttribute('aria-pressed') !== 'true';
      const ok = setCouplet({ key, url: poem.url, title: poem.title, poet: poem.poet?.name || null, lines: unitLines(unit) }, on);
      draw(!ok);
      markSaved();
    });
    draw();
    const done = h('button', { type: 'button', class: 'fav-close' }, 'بستن');
    done.addEventListener('click', close);
    bar = h('div', { class: 'verse-actions' }, btn, done);
    unit.after(bar);
  });
  markSaved();
}

// The favourites page: couplets first (they are what people come back to),
// then poems, newest first.
export function favoritesView() {
  const view = h('section', { class: 'favorites' });
  const draw = () => {
    const { poems, couplets } = load();
    const removeBtn = (onClick) => {
      const b = h('button', { type: 'button', class: 'fav-remove' }, 'برداشتن');
      b.addEventListener('click', () => {
        onClick();
        draw();
      });
      return b;
    };
    const credit = (item) => h('a', { href: item.url }, [item.title, item.poet].filter(Boolean).join('، '));
    view.replaceChildren(
      ...nodes([
        h('h1', {}, 'علاقه‌مندی‌ها'),
        h('p', { class: 'lede' }, 'این فهرست فقط روی همین مرورگر نگه داشته می‌شود و به هیچ جا فرستاده نمی‌شود.'),
        poems.length + couplets.length === 0 &&
          h(
            'p',
            { class: 'fav-empty' },
            'هنوز چیزی نگه نداشته‌اید. در صفحهٔ هر شعر، «افزودن به علاقه‌مندی‌ها» خود شعر را نگه می‌دارد؛ با زدن روی هر بیت هم می‌توانید همان بیت را نگه دارید.',
          ),
        couplets.length > 0 && [
          h('h2', {}, `بیت‌ها (${faDigits(couplets.length)})`),
          h(
            'ul',
            { class: 'fav-couplets' },
            couplets.map((c) =>
              h(
                'li',
                {},
                h(
                  'blockquote',
                  { lang: 'fa' },
                  (c.lines || []).map((l) => h('p', {}, l)),
                ),
                h(
                  'p',
                  { class: 'fav-source' },
                  credit(c),
                  removeBtn(() => setCouplet(c, false)),
                ),
              ),
            ),
          ),
        ],
        poems.length > 0 && [
          h('h2', {}, `شعرها (${faDigits(poems.length)})`),
          h(
            'ul',
            { class: 'fav-poems' },
            poems.map((p) =>
              h(
                'li',
                {},
                credit(p),
                removeBtn(() => setPoem(p, false)),
              ),
            ),
          ),
        ],
      ]),
    );
  };
  draw();
  return view;
}
