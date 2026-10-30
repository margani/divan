// Plays Ganjoor recitations of the open poem and highlights the line being
// read. Audio streams straight from Ganjoor (i.ganjoor.net) with
// preload="none", so Ganjoor serves bytes only when someone presses play,
// just as on its own site.
import { h } from './dom.js';
import { faDigits } from './format.js';
import { currentVerse } from './layout.js';

// Static, trusted markup only; never API data.
const ICONS = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

function icon(name) {
  const t = document.createElement('template');
  t.innerHTML = ICONS[name];
  return t.content.firstChild;
}

function clock(seconds) {
  if (!Number.isFinite(seconds)) return '۰:۰۰';
  const s = Math.floor(seconds);
  return faDigits(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
}

let active = null;

export function stopPlayer() {
  if (!active) return;
  active.cleanup();
  active = null;
}

// Called after a poem renders; adds the listen button when Ganjoor has
// recitations. `isCurrent` says whether the reader is still on this poem.
export async function loadRecitations(poem, { head, article, isCurrent }) {
  let list;
  try {
    const res = await fetch(`/api/recitations?poem=${poem.id}`);
    if (!res.ok) return;
    list = await res.json();
  } catch {
    // The poem is still readable; listening is an extra.
    return;
  }
  if (!isCurrent() || list.length === 0) return;
  const button = h(
    'button',
    { type: 'button', class: 'listen' },
    'شنیدن خوانش',
    h('span', { class: 'count' }, `${faDigits(list.length)} خوانش`),
    icon('play'),
  );
  button.addEventListener('click', () => {
    if (!active) openPlayer(poem, list, article);
    active.play();
  });
  head.append(button);
}

function openPlayer(poem, list, article) {
  const audio = new Audio();
  audio.preload = 'none';

  const playBtn = h('button', { type: 'button', class: 'play', 'aria-label': 'پخش' }, icon('play'));
  const closeBtn = h('button', { type: 'button', class: 'close', 'aria-label': 'بستن پخش‌کننده' }, icon('close'));
  const select = h(
    'select',
    { 'aria-label': 'انتخاب خوانش' },
    list.map((r, i) => h('option', { value: String(i) }, r.artist || 'خوانشگر ناشناس')),
  );
  const seek = h('input', { type: 'range', min: '0', max: '1000', value: '0', class: 'seek', 'aria-label': 'جابه‌جایی در خوانش' });
  const time = h('span', { class: 'time' }, 'زمان ۰:۰۰');
  const bar = h(
    'div',
    { class: 'player', role: 'region', 'aria-label': 'پخش خوانش' },
    h('div', { class: 'player-inner' }, playBtn, h('div', { class: 'meta' }, h('label', { class: 'reciter' }, 'خوانش ', select), seek, time), closeBtn),
  );
  document.body.append(bar);
  document.body.classList.add('has-player');
  article.classList.add('seekable');

  let sync = [];
  let lit = null;
  let lastUserScroll = 0;
  let seeking = false;

  const onUserScroll = () => (lastUserScroll = Date.now());
  window.addEventListener('wheel', onUserScroll, { passive: true });
  window.addEventListener('touchmove', onUserScroll, { passive: true });

  function light(order) {
    if (order === lit) return;
    article.querySelectorAll('.reading').forEach((el) => el.classList.remove('reading'));
    lit = order;
    if (order == null) return;
    const el = article.querySelector(`[data-o="${order}"]`);
    if (!el) return;
    el.classList.add('reading');
    // Follow the reading, but not while the reader is scrolling on their own.
    if (Date.now() - lastUserScroll < 4000) return;
    const r = el.getBoundingClientRect();
    const bottom = window.innerHeight - bar.offsetHeight;
    if (r.top < window.innerHeight * 0.15 || r.bottom > bottom - 40) {
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    }
  }

  // Sets the source synchronously so play() can follow inside the same tap:
  // iOS refuses playback started after an await. Timings arrive later.
  function choose(i) {
    const r = list[i];
    sync = [];
    light(null);
    audio.src = r.mp3;
    time.textContent = 'زمان ۰:۰۰';
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: poem.title,
        artist: r.artist || '',
        album: poem.poet?.name || '',
        artwork: [{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
      });
    }
    if (!r.synced) return;
    fetch(`/api/sync?id=${r.id}`)
      .then((res) => (res.ok ? res.json() : []))
      // Ignore a late answer for a reciter the reader already left.
      .then((pairs) => {
        if (list[select.value] === r) sync = pairs;
      })
      // Without timings it still plays; there is just no highlighting.
      .catch(() => {});
  }

  function setPlaying(playing) {
    playBtn.replaceChildren(icon(playing ? 'pause' : 'play'));
    playBtn.setAttribute('aria-label', playing ? 'توقف' : 'پخش');
  }

  audio.addEventListener('play', () => setPlaying(true));
  audio.addEventListener('pause', () => setPlaying(false));
  audio.addEventListener('ended', () => light(null));
  audio.addEventListener('error', () => {
    if (audio.getAttribute('src')) time.textContent = 'پخش این خوانش ممکن نشد.';
  });
  audio.addEventListener('timeupdate', () => {
    if (!seeking && audio.duration) seek.value = String(Math.round((audio.currentTime / audio.duration) * 1000));
    time.textContent = `زمان ${clock(audio.currentTime)} از ${clock(audio.duration)}`;
    light(currentVerse(sync, audio.currentTime * 1000));
  });
  seek.addEventListener('input', () => (seeking = true));
  seek.addEventListener('change', () => {
    seeking = false;
    if (audio.duration) audio.currentTime = (Number(seek.value) / 1000) * audio.duration;
  });
  playBtn.addEventListener('click', () => (audio.paused ? audio.play() : audio.pause()));
  select.addEventListener('change', () => {
    choose(Number(select.value));
    audio.play().catch(() => {});
  });

  // Tapping a line jumps the recitation to it.
  const onVerseClick = (e) => {
    const el = e.target.closest('[data-o]');
    if (!el || !sync.length || window.getSelection()?.toString()) return;
    const hit = sync.find(([order]) => order === Number(el.dataset.o));
    if (!hit) return;
    audio.currentTime = hit[1] / 1000;
    lastUserScroll = 0;
    audio.play().catch(() => {});
  };
  article.addEventListener('click', onVerseClick);

  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', () => audio.play());
    ms.setActionHandler('pause', () => audio.pause());
    ms.setActionHandler('seekbackward', () => (audio.currentTime = Math.max(0, audio.currentTime - 10)));
    ms.setActionHandler('seekforward', () => (audio.currentTime = audio.currentTime + 10));
    ms.setActionHandler('seekto', (d) => (audio.currentTime = d.seekTime));
  }

  closeBtn.addEventListener('click', stopPlayer);

  choose(0);
  active = {
    audio,
    play: () => audio.play().catch((err) => console.warn('play', err)),
    cleanup() {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      light(null);
      bar.remove();
      document.body.classList.remove('has-player');
      article.classList.remove('seekable');
      article.removeEventListener('click', onVerseClick);
      window.removeEventListener('wheel', onUserScroll);
      window.removeEventListener('touchmove', onUserScroll);
      if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
    },
  };
}
