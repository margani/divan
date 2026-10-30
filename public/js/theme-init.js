// Runs before the stylesheet paints, so a reader who chose a theme never sees
// a flash of the other one. A classic script, not a module: modules are
// deferred, and the CSP forbids inline scripts.
try {
  const t = localStorage.getItem('divan-theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch {
  // Storage blocked (private mode): follow the OS.
}

// Chrome can fire beforeinstallprompt before the deferred app modules run,
// and it fires only once: on Android the install button never appeared
// (#27). Hold on to it here for js/header.js.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.divanInstallPrompt = e;
});
