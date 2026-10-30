import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALPHABET, filterPoets, firstLetter, groupByLetter, normalizeFa } from '../public/js/finder.js';

test('the alphabet is the 32 Persian letters in order', () => {
  assert.equal(ALPHABET.length, 32);
  assert.equal(ALPHABET.join(''), 'ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی');
});

test('normalizeFa folds diacritics, ZWNJ and Arabic letter forms', () => {
  assert.equal(normalizeFa('اَلا'), 'الا');
  assert.equal(normalizeFa('آذر'), 'اذر');
  assert.equal(normalizeFa('علي كاشي'), 'علی کاشی');
  assert.equal(normalizeFa('ملک‌الشعرا'), 'ملک الشعرا');
  assert.equal(normalizeFa('حنظلهٔ'), 'حنظله');
});

test('firstLetter files آ under ا and Arabic forms under Persian ones', () => {
  assert.equal(firstLetter('آذر بیگدلی'), 'ا');
  assert.equal(firstLetter('كمال'), 'ک');
  assert.equal(firstLetter('ﻻهوتی'), 'ل');
  assert.equal(firstLetter('Rumi'), '#');
});

const poets = [
  { name: 'حافظ', url: '/hafez' },
  { name: 'آذر بیگدلی', url: '/azar' },
  { name: 'پروین اعتصامی', url: '/parvin' },
  { name: 'بیدل دهلوی', url: '/bidel' },
  { name: 'ابن یمین', url: '/ibn' },
];

test('groupByLetter follows Persian order, not Unicode order', () => {
  // In Unicode پ comes after ی; in Persian it comes right after ب.
  const groups = groupByLetter(poets);
  assert.deepEqual(groups.map((g) => g.letter), ['ا', 'ب', 'پ', 'ح']);
  assert.deepEqual(groups[0].poets.map((p) => p.url), ['/azar', '/ibn']);
});

test('filterPoets matches anywhere in the name, ignoring forms', () => {
  assert.deepEqual(filterPoets(poets, 'اذر').map((p) => p.url), ['/azar']);
  assert.deepEqual(filterPoets(poets, ' دهلوي ').map((p) => p.url), ['/bidel']);
  assert.equal(filterPoets(poets, '').length, 5);
  assert.equal(filterPoets(poets, 'zz').length, 0);
});

test('filterPoets also searches the full name', () => {
  const list = [{ name: 'مولانا', fullName: 'جلال الدین محمد مولوی', url: '/moulavi' }];
  assert.deepEqual(filterPoets(list, 'مولوی').map((p) => p.url), ['/moulavi']);
});
