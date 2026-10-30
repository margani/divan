// Finding a poet fast: alphabetical groups for the letter picker, and a
// forgiving name filter for the search field.

export const ALPHABET = [...'ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی'];
const RANK = new Map(ALPHABET.map((l, i) => [l, i]));
// آ is filed under ا in the picker but sorts before it, as in Persian
// dictionaries and on Ganjoor (آذر before ابن).
const SORT_RANK = new Map([['آ', -1], ...RANK]);

// Ganjoor's names mix Arabic and Persian letter forms, diacritics and ZWNJ;
// readers type none of that, so both sides are folded the same way.
export function normalizeFa(s, { keepMadda = false } = {}) {
  const folded = s.normalize('NFKC');
  return (keepMadda ? folded : folded.replace(/\u0622/g, '\u0627'))
    // Harakat, superscript alef and hamza marks.
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[\u0623\u0625\u0671]/g, '\u0627')
    .replace(/[\u064A\u0649\u0626]/g, '\u06CC')
    .replace(/\u0643/g, '\u06A9')
    .replace(/[\u06C0\u0629]/g, '\u0647')
    .replace(/\u0624/g, '\u0648')
    .replace(/\u200C/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// '#' gathers names that don't start with a Persian letter.
export function firstLetter(name) {
  const c = normalizeFa(name)[0];
  return RANK.has(c) ? c : '#';
}

const collator = new Intl.Collator('fa');

export function groupByLetter(poets) {
  const groups = new Map();
  for (const p of poets) {
    const l = firstLetter(p.name);
    if (!groups.has(l)) groups.set(l, []);
    groups.get(l).push(p);
  }
  return [...groups]
    .sort(([a], [b]) => (RANK.get(a) ?? 99) - (RANK.get(b) ?? 99))
    .map(([letter, items]) => ({
      letter,
      poets: items.sort((a, b) => compareNames(a.name, b.name)),
    }));
}

// Persian order letter by letter, after folding Arabic forms and diacritics.
function compareNames(a, b) {
  const na = normalizeFa(a, { keepMadda: true });
  const nb = normalizeFa(b, { keepMadda: true });
  for (let i = 0; i < Math.min(na.length, nb.length); i++) {
    const ra = SORT_RANK.get(na[i]);
    const rb = SORT_RANK.get(nb[i]);
    if (ra !== rb) {
      if (ra == null || rb == null) return collator.compare(na.slice(i), nb.slice(i));
      return ra - rb;
    }
  }
  return na.length - nb.length;
}

export function filterPoets(poets, query) {
  const q = normalizeFa(query);
  if (!q) return poets;
  return poets.filter((p) => normalizeFa(`${p.name} ${p.fullName || ''}`).includes(q));
}
