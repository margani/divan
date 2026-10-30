// Songs made from the open poem, from Ganjoor's «ترانه‌ها». Spotify and
// YouTube can play in a bar docked at the bottom, so the reader keeps the
// words on screen; their players load only when the reader taps «پخش»,
// since they bring their own cookies and Divan has no trackers of its own.
import { h, nodes } from './dom.js';
import { faDigits } from './format.js';
import { stopPlayer } from './player.js';

const PLATFORM_NAMES = {
  spotify: 'اسپاتیفای',
  youtube: 'یوتیوب',
  golha: 'گلها',
  beeptunes: 'بیپ‌تونز',
  khosousi: 'خصوصی',
  apple: 'اپل موزیک',
  soundcloud: 'ساندکلاد',
  radiojavan: 'رادیوجوان',
  other: 'شنیدن',
};

const ICONS = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

// Static, trusted markup only; never API data.
function icon(name) {
  const t = document.createElement('template');
  t.innerHTML = ICONS[name];
  return t.content.firstChild;
}

let dock = null;

export function stopSong() {
  if (!dock) return;
  dock.remove();
  dock = null;
  document.body.classList.remove('has-player', 'has-video');
  document.querySelectorAll('.song.playing').forEach((el) => el.classList.remove('playing'));
}

// The recitation player says when it opens, so only one thing plays.
window.addEventListener('divan-recitation', stopSong);

function openSong(row, link, li) {
  stopPlayer();
  stopSong();
  const youtube = link.platform === 'youtube';
  const frame = h('iframe', {
    src: youtube ? `${link.embed}?autoplay=1&playsinline=1` : link.embed,
    title: `${PLATFORM_NAMES[link.platform]}: ${row.artist || ''} ${row.title || ''}`.trim(),
    class: youtube ? 'song-frame video' : 'song-frame',
    allow: 'autoplay; encrypted-media; fullscreen; picture-in-picture',
    referrerpolicy: 'strict-origin-when-cross-origin',
  });
  const close = h('button', { type: 'button', class: 'close', 'aria-label': 'بستن پخش‌کننده' }, icon('close'));
  close.addEventListener('click', stopSong);
  dock = h(
    'div',
    { class: 'player song-dock', role: 'region', 'aria-label': 'پخش ترانه' },
    h('div', { class: 'song-dock-inner' }, frame, close),
  );
  document.body.append(dock);
  document.body.classList.add('has-player');
  document.body.classList.toggle('has-video', youtube);
  li.classList.add('playing');
}

function songRow(row) {
  const playable = row.links.find((l) => l.embed);
  const li = h('li', { class: 'song' });
  const when = row.from && row.to ? `دقیقهٔ ${row.from} تا ${row.to}` : null;
  li.append(
    h(
      'div',
      { class: 'song-info' },
      h('span', { class: 'song-artist' }, row.artist || 'خوانندهٔ ناشناس'),
      row.title && h('span', { class: 'song-title' }, row.title),
      (row.album || when) && h('span', { class: 'song-album' }, [row.album, when].filter(Boolean).join('، ')),
    ),
    h(
      'div',
      { class: 'song-actions' },
      playable && h('button', { type: 'button', class: 'song-play' }, icon('play'), 'پخش'),
      row.links.map((l) =>
        h('a', { class: 'song-link', href: l.url, target: '_blank', rel: 'noopener' }, PLATFORM_NAMES[l.platform] || PLATFORM_NAMES.other),
      ),
    ),
  );
  li.querySelector('.song-play')?.addEventListener('click', () => openSong(row, playable, li));
  return li;
}

// Called after a poem renders; fills `section` with the songs list, or with
// an invitation to add one on Ganjoor when there are none yet.
export async function loadSongs(poem, { section, isCurrent }) {
  let rows;
  try {
    const res = await fetch(`/api/songs?poem=${poem.id}`);
    if (!res.ok) return;
    rows = await res.json();
  } catch {
    // Songs are an extra; the poem is still here.
    return;
  }
  if (!isCurrent()) return;
  // Ganjoor's own form for suggesting a song for this poem (needs a Ganjoor
  // account); approved songs then show up here by themselves.
  const suggest = h(
    'a',
    { href: `https://ganjoor.net/golha?p=${poem.id}`, target: '_blank', rel: 'noopener' },
    'در گنجور معرفی کنید',
  );
  if (rows.length === 0) {
    section.replaceChildren(
      h('p', { class: 'songs-empty' }, 'هنوز آهنگی از این شعر در گنجور ثبت نشده. اگر آهنگی می‌شناسید، ', suggest, '.'),
    );
    return;
  }
  const playable = rows.some((r) => r.links.some((l) => l.embed));
  section.replaceChildren(
    ...nodes([
      h('h2', {}, 'این شعر را خوانده‌اند', h('span', { class: 'count' }, `${faDigits(rows.length)} اجرا`)),
      playable &&
        h('p', { class: 'songs-note' }, 'پخش‌کنندهٔ اسپاتیفای یا یوتیوب تنها با زدن «پخش» باز می‌شود و آن سرویس‌ها کوکی‌های خودشان را دارند.'),
      h('ul', { class: 'songs-list' }, rows.map(songRow)),
      h('p', { class: 'songs-suggest' }, 'آهنگ دیگری از این شعر می‌شناسید؟ ', suggest, '.'),
    ]),
  );
}
