# دیوان

A modern, calm reading interface for Persian poetry, built on the public data of
[Ganjoor](https://ganjoor.net). It is not a replacement for Ganjoor: every poem
page credits Ganjoor and links to the original.

- `public/` — the static site (plain HTML, CSS and ES modules, no build step).
- `functions/api/` — a Cloudflare Pages Function that proxies the few read
  endpoints of `api.ganjoor.net` the reader needs, trims them and caches them
  at the edge for a day.
- `lib/ganjoor.js` — the proxy's logic, unit-tested in `test/`.

## Develop

```sh
npm install
npm run dev          # http://localhost:8788
npm test             # unit tests
npm run shots        # screenshots + layout checks (needs npm run dev)
node scripts/offline-check.mjs   # PWA / offline check (needs npm run dev)
```

## Licences

- divan's own code: MIT, see `LICENSE`.
- Poem texts are not covered by that licence: they come from
  [Ganjoor](https://ganjoor.net), and their copyright status is as Ganjoor's
  [FAQ](https://ganjoor.net/faq?id=21) describes.
- Vazirmatn font: SIL Open Font License 1.1 (`public/fonts/Vazirmatn-OFL.txt`).
