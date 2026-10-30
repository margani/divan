import { buildBlocks, splitStanzas } from './layout.js';
import { faDigits, groupByCentury } from './format.js';

const app = document.getElementById('app');
const GANJOOR = 'https://ganjoor.net';

// Builds DOM with textContent only: poem text and bios come from a third
// party, so nothing from the API is ever parsed as HTML.
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else el.setAttribute(k, v);
  }
  el.append(...nodes(children));
  return el;
}

// Sections are built as nested arrays with `cond && [...]`; DOM append would
// stringify those, so flatten and drop the empty parts first.
function nodes(children) {
  return children.flat(Infinity).filter((c) => c != null && c !== false);
}

function render(...children) {
  app.replaceChildren(...nodes(children));
}

function crumbs(items) {
  if (!items.length) return null;
  return h(
    'nav',
    { class: 'crumbs', 'aria-label': 'مسیر' },
    h('ol', {}, items.map((c) => h('li', {}, h('a', { href: c.url }, c.title)))),
  );
}

async function getJson(url) {
  const res = await fetch(url);
  if (res.status === 404 || res.status === 400) return { notFound: true };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function setTitle(...parts) {
  document.title = [...parts.filter(Boolean), 'دیوان'].join(' · ');
}

function showState(message, retry) {
  render(
    h('div', { class: 'state' }, h('p', {}, message), retry && h('button', { type: 'button' }, 'تلاش دوباره')),
  );
  if (retry) app.querySelector('button').addEventListener('click', retry);
}

function renderHome(poets) {
  setTitle();
  const groups = groupByCentury(poets);
  render(
    h('h1', {}, 'سخنوران'),
    h('p', { class: 'lede' }, `دیوان ${faDigits(poets.length)} سخنور پارسی‌گو، به ترتیب سده‌ای که در آن درگذشته‌اند.`),
    groups.map((g) => [
      h('h2', {}, g.title),
      h('ul', { class: 'poets' }, g.poets.map((p) => h('li', {}, h('a', { href: p.url }, p.name)))),
    ]),
  );
}

function renderCat(cat) {
  const isPoet = cat.breadcrumb.length === 0;
  setTitle(cat.title, !isPoet && cat.poet?.name);
  const bio = cat.description
    ? h('details', { class: 'bio' }, h('summary', {}, 'زندگی‌نامه'), h('p', {}, cat.description))
    : null;
  render(
    crumbs(cat.breadcrumb),
    h('h1', {}, isPoet ? cat.poet?.name || cat.title : cat.title),
    bio,
    cat.children.length > 0 && [
      h('h2', {}, isPoet ? 'آثار' : 'بخش‌ها'),
      h('ul', { class: 'books' }, cat.children.map((c) => h('li', {}, h('a', { href: c.url }, c.title)))),
    ],
    cat.poems.length > 0 && [
      h('h2', {}, `اشعار (${faDigits(cat.poems.length)})`),
      h(
        'ul',
        { class: 'poems' },
        cat.poems.map((p) =>
          h(
            'li',
            {},
            h(
              'a',
              { href: p.url },
              h('span', { class: 'poem-title' }, p.title),
              p.excerpt && h('span', { class: 'excerpt' }, p.excerpt),
            ),
          ),
        ),
      ),
    ],
  );
}

function renderBlock(b) {
  switch (b.type) {
    case 'couplet':
      return h('div', { class: 'couplet' }, h('p', { class: 'h1' }, b.lines[0]), h('p', { class: 'h2' }, b.lines[1]));
    case 'band':
      return h('div', { class: 'band' }, b.lines.map((l) => h('p', {}, l)));
    case 'free':
      return h('div', { class: 'free' }, b.lines.map((l) => h('p', {}, l)));
    default:
      return h('p', { class: b.type }, b.lines[0]);
  }
}

function renderPoem(poem) {
  setTitle(poem.title, poem.poet?.name);
  const stanzas = splitStanzas(buildBlocks(poem.verses));
  const numbered = stanzas.length > 1;
  const original = GANJOOR + poem.url;
  render(
    h(
      'header',
      { class: 'poem-head' },
      crumbs(poem.breadcrumb),
      h('h1', {}, poem.title),
      poem.poet && h('p', { class: 'by' }, 'سرودهٔ ', h('a', { href: poem.poet.url }, poem.poet.name)),
    ),
    h(
      'article',
      { class: 'poem', lang: 'fa' },
      stanzas.map((s, i) =>
        h(
          'section',
          { class: 'stanza', 'aria-label': numbered ? `بند ${faDigits(i + 1)}` : null },
          numbered && h('span', { class: 'stanza-title' }, `بند ${faDigits(i + 1)}`),
          s.blocks.map(renderBlock),
        ),
      ),
    ),
    h(
      'aside',
      { class: 'credit' },
      h(
        'p',
        {},
        'متن این شعر از ',
        h('a', { href: GANJOOR, rel: 'noopener' }, 'گنجور'),
        ' است. ',
        h('a', { href: original, rel: 'noopener' }, 'این شعر را در گنجور ببینید'),
        '؛ با خوانش‌ها، حاشیه‌ها و منابع.',
      ),
    ),
  );
}

let navToken = 0;

async function route() {
  const token = ++navToken;
  const path = decodeURIComponent(location.pathname).replace(/\/+$/, '') || '/';
  showState('در حال بارگذاری…');
  try {
    const data = path === '/' ? await getJson('/api/poets') : await getJson(`/api/page?url=${encodeURIComponent(path)}`);
    // A slower earlier request must not paint over the page the reader moved to.
    if (token !== navToken) return;
    if (data.notFound) {
      setTitle('پیدا نشد');
      showState('این صفحه در گنجور پیدا نشد.');
    } else if (path === '/') renderHome(data);
    else if (data.type === 'poem') renderPoem(data);
    else renderCat(data);
  } catch (err) {
    if (token !== navToken) return;
    console.error(err);
    setTitle('خطا');
    showState('ارتباط با گنجور برقرار نشد؛ کمی بعد دوباره تلاش کنید.', route);
  }
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (!a || a.target || a.hasAttribute('download') || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  const url = new URL(a.href);
  if (url.origin !== location.origin) return;
  e.preventDefault();
  if (url.pathname === location.pathname) return;
  history.pushState(null, '', url.pathname);
  window.scrollTo(0, 0);
  route().then(() => app.focus({ preventScroll: true }));
});

window.addEventListener('popstate', route);
route();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('service worker', err));
}
