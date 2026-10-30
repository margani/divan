// Runs before the stylesheet paints, so a reader who chose a theme never sees
// a flash of the other one. A classic script, not a module: modules are
// deferred, and the CSP forbids inline scripts.
try {
  const t = localStorage.getItem('divan-theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch {
  // Storage blocked (private mode): follow the OS.
}
