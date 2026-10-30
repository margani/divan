import { buildBlocks, splitStanzas } from './layout.js';
import { faDigits, groupByCentury } from './format.js';
import { h, nodes } from './dom.js';
import { loadRecitations, stopPlayer } from './player.js';
import { VERSION } from './version.js';
import { setupHeader } from './header.js';

const app = document.getElementById('app');
const GANJOOR = 'https://ganjoor.net';

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

// data-o is the verse order a recitation's timings point at.
function line(b, i, cls) {
  return h('p', { class: cls, 'data-o': b.orders?.[i] ?? null }, b.lines[i]);
}

function renderBlock(b) {
  switch (b.type) {
    case 'couplet':
      return h('div', { class: 'couplet' }, line(b, 0, 'h1'), line(b, 1, 'h2'));
    case 'band':
    case 'free':
      return h('div', { class: b.type }, b.lines.map((_, i) => line(b, i)));
    default:
      return line(b, 0, b.type);
  }
}

function renderPoem(poem) {
  setTitle(poem.title, poem.poet?.name);
  const stanzas = splitStanzas(buildBlocks(poem.verses));
  const numbered = stanzas.length > 1;
  const original = GANJOOR + poem.url;
  const head = h(
    'header',
    { class: 'poem-head' },
    crumbs(poem.breadcrumb),
    h('h1', {}, poem.title),
    poem.poet && h('p', { class: 'by' }, 'سرودهٔ ', h('a', { href: poem.poet.url }, poem.poet.name)),
  );
  const article = h(
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
  );
  render(
    head,
    article,
    h(
      'aside',
      { class: 'credit' },
      h(
        'p',
        {},
        'متن این شعر و خوانش‌هایش از ',
        h('a', { href: GANJOOR, rel: 'noopener' }, 'گنجور'),
        ' است. ',
        h('a', { href: original, rel: 'noopener' }, 'این شعر را در گنجور ببینید'),
        '؛ با حاشیه‌ها و منابع.',
      ),
    ),
  );
  const token = navToken;
  loadRecitations(poem, { head, article, isCurrent: () => token === navToken });
}

let navToken = 0;

async function route() {
  const token = ++navToken;
  // A recitation belongs to its poem; leaving the page ends it.
  stopPlayer();
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
setupHeader();
document.getElementById('version').textContent = `نسخهٔ ${faDigits(VERSION)}`;
route();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('service worker', err));
}
