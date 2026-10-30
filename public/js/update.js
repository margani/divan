// Registers the service worker and, when a new release has installed in the
// background, offers it in a bar instead of switching silently.
import { h } from './dom.js';

// An installed app can stay open for days; look again when it comes back
// to the foreground and every half hour.
const CHECK_EVERY = 30 * 60 * 1000;

function offer(worker) {
  if (document.querySelector('.update-bar')) return;
  const apply = h('button', { type: 'button', class: 'update-apply' }, 'به‌روزرسانی');
  const later = h('button', { type: 'button', class: 'update-later' }, 'بعداً');
  const bar = h('div', { class: 'update-bar', role: 'status' }, h('p', {}, 'نسخهٔ تازه آماده است.'), apply, later);
  apply.addEventListener('click', () => {
    apply.disabled = true;
    accepted = true;
    worker.postMessage('skip-waiting');
  });
  later.addEventListener('click', () => bar.remove());
  document.body.append(bar);
}

// Reload only after the reader accepted; the first install also changes the
// controller, and that must not reload the page.
let accepted = false;

export function watchUpdates() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (accepted) location.reload();
  });
  navigator.serviceWorker
    .register('/sw.js')
    .then((reg) => {
      // Only an update if a version already runs this page.
      const maybeOffer = (w) => navigator.serviceWorker.controller && offer(w);
      if (reg.waiting) maybeOffer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => w.state === 'installed' && maybeOffer(w));
      });
      const check = () => reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
      setInterval(check, CHECK_EVERY);
    })
    .catch((err) => console.warn('service worker', err));
}
