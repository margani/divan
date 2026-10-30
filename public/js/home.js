// The home page: every poet, by century or alphabetically, with a search
// field and a letter picker so a poet is a tap or two away.
import { h, nodes } from './dom.js';
import { faDigits, groupByCentury } from './format.js';
import { ALPHABET, filterPoets, groupByLetter } from './finder.js';

const ORDER_KEY = 'divan-poet-order';

function savedOrder() {
  try {
    return localStorage.getItem(ORDER_KEY) === 'alpha' ? 'alpha' : 'century';
  } catch {
    return 'century';
  }
}

function saveOrder(order) {
  try {
    localStorage.setItem(ORDER_KEY, order);
  } catch {
    // Not remembered; the page still switches.
  }
}

const poetList = (items) => h('ul', { class: 'poets' }, items.map((p) => h('li', {}, h('a', { href: p.url }, p.name))));

export function homeView(poets) {
  let order = savedOrder();
  const list = h('div', { class: 'poet-groups' });
  const search = h('input', {
    type: 'search',
    class: 'search',
    placeholder: 'جستجوی سخنور',
    'aria-label': 'جستجوی سخنور',
    autocomplete: 'off',
    enterkeyhint: 'search',
  });
  const byCentury = h('button', { type: 'button', 'data-order': 'century' }, 'سده');
  const byAlpha = h('button', { type: 'button', 'data-order': 'alpha' }, 'الفبا');
  const lettersBtn = h('button', { type: 'button', class: 'letters-btn', 'aria-haspopup': 'dialog' }, 'حروف الفبا');

  const letterGroups = groupByLetter(poets);
  const present = new Set(letterGroups.map((g) => g.letter));
  const dialog = h(
    'dialog',
    { class: 'letters', 'aria-label': 'رفتن به حرف' },
    h('p', { class: 'letters-title' }, 'رفتن به سخنورانی که نامشان با این حرف آغاز می‌شود'),
    h(
      'div',
      { class: 'letters-grid' },
      ALPHABET.map((l) => h('button', { type: 'button', value: l, disabled: !present.has(l) }, l)),
    ),
    h('form', { method: 'dialog' }, h('button', { class: 'letters-close' }, 'بستن')),
  );

  function draw() {
    for (const b of [byCentury, byAlpha]) b.setAttribute('aria-pressed', String(b.dataset.order === order));
    const q = search.value;
    if (q.trim()) {
      const found = filterPoets(poets, q);
      const flat = groupByLetter(found).flatMap((g) => g.poets);
      list.replaceChildren(
        ...nodes([
          found.length
            ? [h('p', { class: 'found' }, `پیدا شد: ${faDigits(found.length)} سخنور`), poetList(flat)]
            : h('p', { class: 'found' }, 'سخنوری با این نام پیدا نشد.'),
        ]),
      );
      return;
    }
    const groups =
      order === 'alpha'
        ? letterGroups.map((g) => ({ title: g.letter === '#' ? 'سایر' : g.letter, id: `letter-${g.letter}`, poets: g.poets }))
        : groupByCentury(poets);
    list.replaceChildren(
      ...groups.flatMap((g) => [
        h('h2', { id: g.id || null, class: order === 'alpha' ? 'letter' : null }, g.title),
        poetList(g.poets),
      ]),
    );
  }

  function setOrder(next) {
    order = next;
    saveOrder(next);
    draw();
  }

  search.addEventListener('input', draw);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      search.value = '';
      draw();
    }
  });
  byCentury.addEventListener('click', () => setOrder('century'));
  byAlpha.addEventListener('click', () => setOrder('alpha'));
  lettersBtn.addEventListener('click', () => dialog.showModal());
  // A tap on the dimmed backdrop lands on the dialog itself.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.querySelector('.letters-grid').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    dialog.close();
    search.value = '';
    if (order !== 'alpha') setOrder('alpha');
    else draw();
    // Land just below the sticky finder bar, whose height depends on the
    // screen width (it wraps to two rows on phones).
    const heading = document.getElementById(`letter-${b.value}`);
    const bar = document.querySelector('.finder');
    if (heading) window.scrollTo(0, heading.getBoundingClientRect().top + window.scrollY - bar.offsetHeight - 8);
  });

  draw();
  return [
    h('h1', {}, 'سخنوران'),
    h('p', { class: 'lede' }, `دیوان ${faDigits(poets.length)} سخنور پارسی‌گو را دربر دارد.`),
    // Songs across every poet, before choosing one (sung.js).
    h('a', { class: 'songs-link', href: '/songs' }, 'شعرهایی که ترانه شده‌اند'),
    h(
      'div',
      { class: 'finder' },
      search,
      h('div', { class: 'finder-row' }, h('div', { class: 'seg', role: 'group', 'aria-label': 'ترتیب' }, byCentury, byAlpha), lettersBtn),
    ),
    list,
    dialog,
  ];
}
