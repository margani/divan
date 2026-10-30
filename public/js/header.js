// The header's icon buttons: light/dark theme and installing the app.
import { h } from './dom.js';

const ICONS = {
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  install: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11M7.5 9.5L12 14l4.5-4.5M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function icon(name) {
  const t = document.createElement('template');
  t.innerHTML = ICONS[name];
  return t.content.firstChild;
}

const root = document.documentElement;
const osDark = matchMedia('(prefers-color-scheme: dark)');

function currentTheme() {
  return root.dataset.theme || (osDark.matches ? 'dark' : 'light');
}

function syncThemeButton(btn) {
  const dark = currentTheme() === 'dark';
  btn.replaceChildren(icon(dark ? 'sun' : 'moon'));
  const label = dark ? 'رفتن به حالت روشن' : 'رفتن به حالت تاریک';
  btn.setAttribute('aria-label', label);
  btn.title = label;
  // Keep the browser bar in step with the page, not with the OS.
  const bg = getComputedStyle(document.body).backgroundColor;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg));
}

function setupTheme(btn) {
  btn.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try {
      localStorage.setItem('divan-theme', next);
    } catch {
      // Not remembered, but still switched for this visit.
    }
    syncThemeButton(btn);
  });
  osDark.addEventListener('change', () => syncThemeButton(btn));
  syncThemeButton(btn);
}

const standalone = () =>
  matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// iPhone and iPad Safari never offer an install prompt; iPadOS reports
// itself as a Mac, so touch support tells them apart.
const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

// Phones and tablets; a desktop browser that offers no prompt (Firefox,
// Safari on a Mac) has no install route worth pointing at.
const isTouch = () => matchMedia('(pointer: coarse)').matches;

const HINTS = {
  ios: 'برای نصب دیوان، در سافاری دکمهٔ هم‌رسانی را بزنید و «افزودن به صفحهٔ اصلی» را انتخاب کنید.',
  menu: 'برای نصب دیوان، منوی مرورگر (سه نقطه) را باز کنید و «نصب برنامه» یا «افزودن به صفحهٔ اصلی» را بزنید.',
};

function showHint(text) {
  document.querySelector('.hint')?.remove();
  const hint = h('div', { class: 'hint', role: 'dialog', 'aria-label': 'نصب دیوان' }, h('p', {}, text));
  document.body.append(hint);
  const close = (e) => {
    if (e.type === 'keydown' && e.key !== 'Escape') return;
    hint.remove();
    document.removeEventListener('click', close, true);
    document.removeEventListener('keydown', close);
  };
  // Defer so the tap that opened it doesn't close it.
  setTimeout(() => {
    document.addEventListener('click', close, true);
    document.addEventListener('keydown', close);
  });
}

function setupInstall(btn) {
  btn.append(icon('install'));
  if (standalone()) return;
  // Caught early by theme-init.js when Chrome fired it before this ran.
  let deferred = window.divanInstallPrompt || null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    btn.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    btn.hidden = true;
  });
  // Chrome on Android may not offer the prompt (dismissed before, or its own
  // heuristics), but its menu can still install, so phones always get it.
  btn.hidden = !(deferred || isIOS() || isTouch());
  btn.addEventListener('click', async () => {
    if (deferred) {
      const prompt = deferred;
      deferred = window.divanInstallPrompt = null;
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') btn.hidden = true;
    } else {
      showHint(isIOS() ? HINTS.ios : HINTS.menu);
    }
  });
}

export function setupHeader() {
  setupTheme(document.getElementById('theme-btn'));
  setupInstall(document.getElementById('install-btn'));
}
