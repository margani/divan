import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBlocks, splitStanzas } from '../public/js/layout.js';
import { centuryLabel, centuryOf, faDigits, groupByCentury } from '../public/js/format.js';
import { shapePoem } from '../lib/ganjoor.js';

const v = (p, t, c) => ({ p, t, c });

test('right/left pairs become couplets', () => {
  const blocks = buildBlocks([v('right', 'a', 0), v('left', 'b', 0), v('right', 'c', 1), v('left', 'd', 1)]);
  assert.deepEqual(blocks, [
    { type: 'couplet', lines: ['a', 'b'] },
    { type: 'couplet', lines: ['c', 'd'] },
  ]);
});

test('a lone hemistich keeps its side', () => {
  assert.deepEqual(buildBlocks([v('right', 'a', 0)]), [{ type: 'couplet', lines: ['a', ''] }]);
  assert.deepEqual(buildBlocks([v('left', 'b', 0)]), [{ type: 'couplet', lines: ['', 'b'] }]);
});

test('free verse lines group together, prose and comments stand alone', () => {
  const blocks = buildBlocks([v('single', 'x', 0), v('single', 'y', 1), v('prose', 'p', 2), v('comment', 'n', 3)]);
  assert.deepEqual(blocks, [
    { type: 'free', lines: ['x', 'y'] },
    { type: 'prose', lines: ['p'] },
    { type: 'comment', lines: ['n'] },
  ]);
});

test('a real tarji\'-band splits into five stanzas, each ending with its band', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/poem-tarjeeband.json', import.meta.url)));
  const stanzas = splitStanzas(buildBlocks(shapePoem(fixture).verses));
  assert.equal(stanzas.length, 5);
  for (const s of stanzas) {
    const last = s.blocks.at(-1);
    assert.equal(last.type, 'band');
    assert.equal(last.lines.length, 2);
    assert.ok(s.blocks.slice(0, -1).every((b) => b.type === 'couplet'));
  }
  // The refrain of Hatef's tarji'-band is the same in every stanza.
  assert.equal(new Set(stanzas.map((s) => s.blocks.at(-1).lines.join('|'))).size, 1);
});

test('a ghazal is a single stanza', () => {
  const stanzas = splitStanzas(buildBlocks([v('right', 'a', 0), v('left', 'b', 0)]));
  assert.equal(stanzas.length, 1);
});

test('numbers and centuries read in Persian', () => {
  assert.equal(faDigits(1404), '۱۴۰۴');
  assert.equal(centuryOf(792), 8);
  assert.equal(centuryOf(800), 8);
  assert.equal(centuryOf(801), 9);
  assert.equal(centuryOf(0), null);
  assert.equal(centuryLabel(8), 'قرن هشتم');
  assert.equal(centuryLabel(null), 'سایر سخنوران');
});

test('groupByCentury orders by century and puts undated poets last', () => {
  const groups = groupByCentury([
    { name: 'ب', death: 0 },
    { name: 'حافظ', death: 792 },
    { name: 'رودکی', death: 329 },
  ]);
  assert.deepEqual(groups.map((g) => g.title), ['قرن چهارم', 'قرن هشتم', 'سایر سخنوران']);
});
