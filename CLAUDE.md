# divan

A modern, beautiful reading interface for Persian poetry, built on Ganjoor's
public data (https://ganjoor.net). It is not a replacement for Ganjoor; it is a
nicer reader that credits and links Ganjoor on every poem page.

- Repo: https://github.com/margani/divan (public since 2026-10-30)
- Production: https://divan.whosane.dev — Cloudflare Pages project `divan`
  (also https://divan-5yt.pages.dev) on the "Hossein" account. Every merge to
  `main` deploys production through the Pages GitHub integration; PR branches
  get preview deploys. No build step (`public/` is the output dir).
- DNS: proxied CNAME `divan` → `divan-5yt.pages.dev` in the whosane.dev zone,
  created with `cfapi --net`.
- Verify a deploy: `curl https://divan.whosane.dev/api/version` must report the
  merged commit; `x-divan-cache: hit` on a repeated `/api/page` read shows
  the edge cache is sparing Ganjoor.

## Project rules

- UI text is Persian. Every Persian line must start with a Persian letter, not
  an emoji, a number or a Latin word, so RTL renders correctly. Emoji go at the
  end of the line.
- Code, comments and file names are in English.
- No tracking or analytics of any kind (this includes third-party font CDNs:
  fonts are self-hosted).
- Always credit and link Ganjoor: every poem page links to the poem's original
  page on ganjoor.net.
- Cache data sensibly so we never put load on Ganjoor's servers.
- Only use fonts whose licence allows web use (e.g. SIL OFL), and keep each
  font's licence file next to it.
- Keep it simple: plain HTML/CSS/JS (Vite with vanilla JS only if routing really
  needs it). No frameworks, no state libraries.
- v1 scope: home (poet list), poet page (books and poems), poem page. Not in v1:
  accounts, comments, favourites sync, search, audio. Ask the owner before
  anything outside the agreed scope.

## Ganjoor data (researched 2026-10-30)

Two official sources, both with CORS open to browsers:

1. **Static export** `https://cdn.jsdelivr.net/gh/ganjoor/ganjoor-data@main/`
   (repo `ganjoor/ganjoor-data`, docs in its `API.md`). `Access-Control-Allow-Origin: *`,
   `Cache-Control: public, max-age=604800`. Files:
   - `manifest.json` — all poets (`Id`, `Nickname`, `FullUrl`) and URL templates.
   - `poets/{poet}/poet.json` — bio, `ImageUrl`, birth/death years (lunar hijri).
   - `poets/{poet}/{catPath}/_cat.json` — `Title`, `ChildCats[]`, `Poems[]`.
   - `poets/{poet}/{catPath}/{poemSlug}.json` — the Ganjoor URL path maps 1:1,
     e.g. `/hafez/ghazal/sh1` → `poets/hafez/ghazal/sh1.json`. Has `Verses[]`
     with `Position` as a string and `Sections[]`.
   - Can lag the live site by up to ~7 days (jsDelivr edge cache on `@main`).
2. **Live API** `https://api.ganjoor.net` (Swagger: `/swagger/v1/swagger.json`).
   Reflects the request `Origin` in `Access-Control-Allow-Origin`; sends no
   `Cache-Control`. Useful endpoints:
   - `GET /api/ganjoor/poets` — published poets (no bios).
   - `GET /api/ganjoor/poet?url=/hafez` — poet + root category with children.
   - `GET /api/ganjoor/cat?url=/hafez/ghazal&poems=true` — a category.
   - `GET /api/ganjoor/page?url=/rahi/tarane/sh20` — any page by path (heavy:
     includes comments).
   - `GET /api/ganjoor/poem?url=...&catInfo=true&recitations=false&comments=false...`
     — a poem with flags to trim the payload.
   - `GET /api/ganjoor/poem/{id}/verses` — verses.
   - `GET /api/ganjoor/poem/{id}/recitations` — audio recitations (v2), and
     `GET /api/audio/verses/{id}` — verse sync timings for a recitation.

Verse `Position` values (enum `VersePosition` in GanjoorService):
`Right`=0 first hemistich, `Left`=1 second hemistich, `CenteredVerse1`=2 and
`CenteredVerse2`=3 the band couplet of tarji'/tarkib-band (marks the end of a
stanza), `Single`=4 free verse (Nimaei), `Comment`=5 explanatory paragraph,
`Paragraph`=-1 prose. Verses whose `CoupletSummary` starts with «هوش مصنوعی»
are AI-generated summaries; don't show them as part of the poem.

Licence: GanjoorService is GPL-3.0; the data export has no licence file.
Ganjoor's FAQ (https://ganjoor.net/faq?id=21) says the data is free to download
but Ganjoor has not checked its copyright status; classical works (Hafez,
Saadi…) are safe, and copyright responsibility for edited/contemporary works
lies with the reuser.

## Architecture

- `public/` is served as-is by Cloudflare Pages (no build step); Pages serves
  `index.html` for unknown paths, so poem URLs mirror Ganjoor's paths.
- `functions/api/[[path]].js` is the only server code: `/api/poets` and
  `/api/page?url=/path` (poem or category), logic in `lib/ganjoor.js`.
  Edge cache: a day fresh, a week stale-while-revalidate. The Cache API only
  works on the custom domain, not on `*.pages.dev`.

## Checks before merging

`npm test`, then with `npm run dev` running: `npm run shots` (28 page/viewport/
theme checks, screenshots in `shots/`) and `node scripts/offline-check.mjs`.
Look at the screenshots, not just the exit code.

## Lessons

- 2026-10-30: `api.ganjoor.net/api/ganjoor/poem` returns an empty `verses`
  list when `verseDetails=false`; it must be `true`. Wrangler's local cache
  then kept the empty answer, so clear `.wrangler/state/v3/cache` after
  proxy changes.
- 2026-10-30: Pages answers `/index.html` with a 308 to `/`. Never precache
  `/index.html` in the service worker: a cached redirect can't serve a
  navigation, which broke offline reloads.
- 2026-10-30: `Element.replaceChildren` and `append` stringify arrays. The
  render helpers in `app.js` flatten first; a check for "[object" text in
  `scripts/screenshots.mjs` guards it.
