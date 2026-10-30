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
- v1 scope: home (poet list), poet page (books and poems), poem page.
  v2 (0.2.0): Ganjoor's audio recitations with verse highlighting. 0.5.0: an
  About page at `/about` (static, `js/about.js`; Ganjoor has no `/about`
  path), linked from the header. 0.6.0: songs made from the poem (Ganjoor's
  «ترانه‌ها»); Spotify and YouTube play in a docked bar, loaded only when the
  reader taps «پخش» (they set their own cookies; `frame-src` in `_headers`
  allows only those two); Golha and the rest are links out. 0.7.0: a book's
  poem list marks the poems with songs and can be narrowed to them
  («فقط شعرهای ترانه‌شده», kept in the URL as `?songs`); a poet page counts
  each book's sung poems (`js/sung.js`). 0.8.0: with that filter on, a
  «خواننده» list narrows it to one singer (`?songs=<singer>`) and «قابل پخش»
  to songs that play in the docked player (`&play`; same rule as the «پخش»
  button). Not built:
  accounts, comments, favourites sync, search. Ask the owner before anything
  outside the agreed scope.
- Audio always streams straight from i.ganjoor.net with `preload="none"`;
  never proxy or cache mp3s through Cloudflare (CDN terms on audio, and it
  would multiply nothing for Ganjoor anyway).
- The app version lives in `package.json`, `public/js/version.js` and the
  `VERSION` line of `public/sw.js`; a test keeps them equal. Bump all three
  for every release: the sw.js change is what makes browsers see an update,
  and the reader is then offered it («به‌روزرسانی» bar, `js/update.js`).

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
   - `GET /api/ganjoor/poem/{id}/songs?approved=true` — songs made from the
     poem (without `approved=true` it returns nothing). `trackType`: 0
     BeepTunes/Khosousi, 1 Golha (no artist; the singer is inside
     `trackName`, «خواننده ترانه: بنان، غلامحسین»), 2 iTunes, 3 Spotify, 4 any
     link Ganjoor's `MusicUrlValidator` accepts (YouTube, SoundCloud…).
     Readers suggest new songs on Ganjoor at `https://ganjoor.net/golha?p={poemId}`
     (needs a Ganjoor login); approved ones appear in Divan by themselves.
   - Which poems have songs: no flag in category data. Ganjoor's music index
     page `/mundex/bypoet` (`GET /api/ganjoor/page?url=/mundex/bypoet`,
     ~2.3 MB, rebuilt by `GanjoorService-Mundex.cs`) lists every approved
     track as `<li><p><a href="/poem/path">…`; on 2026-10-28 that was 2,493
     poems from 102 poets. Never fetch `/songs` per poem for a list.
     Each item reads `… در {artist}  » {album} » <a …>{track}</a>`; Golha
     items say «گلها» and keep the singer in the track text. Names need
     entity decoding, Arabic ي/ك folded and direction marks stripped
     («‏ایرج» with an RLM was a second «ایرج»). ~680 singers.
     Parsing takes ~15 ms of CPU once a day; fine on the account's Workers
     Paid plan, but too much for the free plan's 10 ms.

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
- `functions/api/[[path]].js` is the only server code: `/api/poets`,
  `/api/page?url=/path` (poem or category), `/api/recitations?poem=ID`
  (normal recitations only), `/api/songs?poem=ID` (one row per singer), `/api/sung` (`{singers, poems, playable}`, each
  a `{path: [singer indexes]}` map, from Ganjoor's music index; an empty parse is a 502,
  never cached),
  `/api/sync?id=ID` ([verseOrder, ms] pairs) and
  `/api/version`; logic in `lib/ganjoor.js`.
- Recitation timings: `/api/audio/verses/{id}` is already corrected for old
  files (`OneSecondBugFix`) and keyed by `VOrder`; 0 is the title.
  Edge cache: a day fresh, a week stale-while-revalidate. The Cache API only
  works on the custom domain, not on `*.pages.dev`.

## Checks before merging

`npm test`, then with `npm run dev` running: `npm run shots` (32 page/viewport/
theme checks, screenshots in `shots/`), `node scripts/offline-check.mjs` and
`node scripts/player-check.mjs` (plays real Ganjoor audio),
`node scripts/header-check.mjs`, `node scripts/finder-check.mjs`,
`node scripts/songs-check.mjs`, `node scripts/sung-check.mjs` and
`TMPDIR=<scratch> node scripts/update-check.mjs` (a returning reader gets new
code despite a long browser cache). After a
deploy, run player-check against https://divan.whosane.dev too.
Look at the screenshots, not just the exit code.

## Lessons

- 2026-10-30: `api.ganjoor.net/api/ganjoor/poem` returns an empty `verses`
  list when `verseDetails=false`; it must be `true`. Wrangler's local cache
  then kept the empty answer, so clear `.wrangler/state/v3/cache` after
  proxy changes — with the dev server stopped (deleting it under a running
  server makes every cached endpoint answer 500).
- 2026-10-30: Pages answers `/index.html` with a 308 to `/`. Never precache
  `/index.html` in the service worker: a cached redirect can't serve a
  navigation, which broke offline reloads.
- 2026-10-30: `Element.replaceChildren` and `append` stringify arrays. The
  render helpers in `app.js` flatten first; a check for "[object" text in
  `scripts/screenshots.mjs` guards it.
- 2026-10-30: iOS only plays audio when `play()` runs inside the tap itself;
  don't await anything (like the sync fetch) before calling it.
- 2026-10-30: media playback controls are not mirrored in RTL (play points
  right, progress runs left to right), per Material's bidirectionality rules.
- 2026-10-30: v2 changed the poem payload, but the edge cache kept serving v1
  payloads (no verse orders), so highlighting failed live while the pages.dev
  preview (no Cache API there) looked fine. Bump `SHAPE_VERSION` in
  `lib/ganjoor.js` (part of every cache key) and the SW `DATA` cache name on
  any payload change, and rerun `scripts/player-check.mjs` against production
  after deploying.
- 2026-10-30: the `[object …]` bug came back in the home finder through a
  bare `replaceChildren([...])`. Always pass `...nodes([...])`; the finder
  check would catch it.
- 2026-10-30: `\u` escapes typed into a tool call reach the file as literal
  characters (invisible ZWNJ, harakat). Write such regexes from char codes
  and check with `grep -nP '[^\x00-\x7F]'`.
- 2026-10-30: the whosane.dev zone's Browser Cache TTL (4 h) overrides
  Pages' `max-age=0` for JS/CSS on the custom domain (pages.dev is not
  affected), so returning readers kept old code after a release. The service
  worker now fetches code with `cache: 'no-cache'` and precaches with
  `cache: 'reload'`; `scripts/update-check.mjs` reproduces it. Playwright
  request interception disables the HTTP cache, so that check runs its own
  server.
- 2026-10-30: the install button never showed on Android Chrome (#27):
  `beforeinstallprompt` fires once and can come before the deferred app
  modules run. `theme-init.js` (a classic head script) now catches it, and
  touch devices get the button even without a prompt (a browser-menu hint).
  `scripts/header-check.mjs` delays `app.js` to reproduce the race.
- 2026-10-30: the songs section printed «false»: a `cond && node` passed to
  `replaceChildren` without `...nodes([...])` again (third time). Any new
  render code goes through `nodes`; `scripts/songs-check.mjs` checks for
  junk text.
- 2026-10-30: Spotify's embed plays only a 30-second preview unless the
  reader is signed in to Spotify in that browser (seen in songs-check's
  dock screenshot).
- 2026-10-30: a Playwright `waitForResponse` set up after `goto` missed a
  response that had already arrived and sat out its 30 s timeout on every
  loop (`.catch` hid it). Create the wait before the navigation.
- 2026-10-30: changing `/api/sung`'s shape twice inside one unreleased
  `SHAPE_VERSION` left wrangler's local cache serving the first draft, and
  the page threw on the missing field. Clear `.wrangler/state/v3/cache`
  (server stopped) after any payload change, even an unreleased one.
