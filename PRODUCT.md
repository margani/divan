# Product

<!-- impeccable:product-schema 1 -->

## Platform

web (an installable PWA; mobile web first, desktop supported)

## Users

Persian speakers who read classical Persian poetry for pleasure, mostly on a
phone and often in the evening or at night. They open a poet, a book or a
known poem, read calmly, listen to a recitation or a song made from the poem,
and come back to the poems and couplets they have saved as favourites.

## Product Purpose

Divan is a calm, beautiful reader for Persian poetry built on Ganjoor's public
data. It is not a replacement for Ganjoor: it is a nicer place to read that
credits and links Ganjoor on every poem page. Success is a reader who enjoys
reading, listens, and returns to their favourites.

## Positioning

A quiet, private reader on top of Ganjoor: no ads, no tracking or analytics,
no accounts. Reading comes first, with recitations synced verse by verse and
the songs made from each poem linked to the text, while Ganjoor is always
credited as the source.

## Operating Context

- Poems, poets and books come from Ganjoor (static export and api.ganjoor.net)
  through a small edge-cached proxy; Divan never puts noticeable load on
  Ganjoor.
- Recitations stream straight from Ganjoor; songs open in a docked
  Spotify/YouTube player only when the reader taps play, other platforms are
  links out.
- Favourites live only in the reader's browser (localStorage).
- Works offline for pages already read (service worker).

## Capabilities and Constraints

- Shipped: poet list, poet and book pages, poem page, synced recitations,
  songs per poem, sung-poem marks and filters (singer, playable, platform),
  a songs page across poets, favourites for poems and couplets, About page.
- Not built, by decision: accounts, comments, favourites sync, search. Anything
  outside the agreed scope is the owner's call.
- UI text is Persian and right-to-left; each Persian line starts with a
  Persian letter. Code and file names are English.
- Plain HTML/CSS/ES modules, no framework, no build step, Cloudflare Pages.
- No third-party requests for fonts or analytics; fonts are self-hosted and
  web-licensed (Vazirmatn, SIL OFL).
- Light and dark themes.

## Brand Commitments

- Name: «دیوان» (Divan).
- Always credit and link Ganjoor on every poem page.
- Voice: calm and plain Persian.

## Evidence on Hand

- Real poem, recitation and song data from Ganjoor; no testimonials, usage
  figures or press exist, and none may be invented (the product has no
  analytics by design).

## Product Principles

1. Reading comes first; everything else stays quiet until asked for.
2. Respect the reader's privacy: nothing tracks, nothing needs an account.
3. Respect Ganjoor: credit it everywhere and spare its servers.
4. Audio and songs serve the text, tied to the verses they belong to.

## Accessibility & Inclusion

WCAG 2.2 AA, in right-to-left Persian, in both light and dark themes, at
phone and desktop widths.
