// Turns Ganjoor's flat verse list into what the page draws: couplets,
// band couplets, free-verse lines and prose, split into stanzas when the
// poem is a tarji'-band or tarkib-band.

// Each verse is { p, t, c, o }: position, text, couplet index and verse order
// (see lib/ganjoor.js). Blocks keep each line's order so a recitation can
// highlight it.
export function buildBlocks(verses) {
  const blocks = [];
  let i = 0;
  while (i < verses.length) {
    const v = verses[i];
    if (v.p === 'right' || v.p === 'left') {
      const next = verses[i + 1];
      if (v.p === 'right' && next && next.p === 'left' && next.c === v.c) {
        blocks.push({ type: 'couplet', lines: [v.t, next.t], orders: [v.o, next.o] });
        i += 2;
      } else {
        // A lone hemistich still sits in the couplet grid, on its own side.
        blocks.push(
          v.p === 'right'
            ? { type: 'couplet', lines: [v.t, ''], orders: [v.o, null] }
            : { type: 'couplet', lines: ['', v.t], orders: [null, v.o] },
        );
        i += 1;
      }
    } else if (v.p === 'center1' || v.p === 'center2') {
      const lines = [v.t];
      const orders = [v.o];
      if (v.p === 'center1' && verses[i + 1]?.p === 'center2') {
        lines.push(verses[i + 1].t);
        orders.push(verses[i + 1].o);
        i += 1;
      }
      blocks.push({ type: 'band', lines, orders });
      i += 1;
    } else if (v.p === 'single') {
      const lines = [];
      const orders = [];
      while (i < verses.length && verses[i].p === 'single') {
        lines.push(verses[i].t);
        orders.push(verses[i++].o);
      }
      blocks.push({ type: 'free', lines, orders });
    } else {
      blocks.push({ type: v.p === 'comment' ? 'comment' : 'prose', lines: [v.t], orders: [v.o] });
      i += 1;
    }
  }
  return blocks;
}

// In a band poem every stanza ends with its band couplet. A poem with band
// couplets but no ordinary couplets (some mostazad and mosammat) has no
// stanzas to number, so it stays as one block list.
export function splitStanzas(blocks) {
  const hasBand = blocks.some((b) => b.type === 'band');
  const hasCouplet = blocks.some((b) => b.type === 'couplet');
  if (!hasBand || !hasCouplet) return [{ blocks }];
  const stanzas = [];
  let current = [];
  for (const b of blocks) {
    current.push(b);
    if (b.type === 'band') {
      stanzas.push({ blocks: current });
      current = [];
    }
  }
  if (current.length) stanzas.push({ blocks: current });
  return stanzas;
}

// `sync` is Ganjoor's [verseOrder, startMs] list sorted by start; order 0 is
// the poem's title, which has no line to highlight.
export function currentVerse(sync, ms) {
  let found = null;
  for (const [order, start] of sync) {
    if (start > ms) break;
    found = order;
  }
  return found === 0 ? null : found;
}
