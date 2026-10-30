const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function faDigits(value) {
  return String(value).replace(/[0-9]/g, (d) => FA_DIGITS[d]);
}

const ORDINALS = [
  'اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم', 'هفتم', 'هشتم',
  'نهم', 'دهم', 'یازدهم', 'دوازدهم', 'سیزدهم', 'چهاردهم', 'پانزدهم',
];

// Ganjoor dates poets in lunar hijri years, and its own home page groups
// them by the century they died in.
export function centuryOf(year) {
  if (!year || year < 1) return null;
  return Math.floor((year - 1) / 100) + 1;
}

export function centuryLabel(century) {
  return century && ORDINALS[century - 1] ? `قرن ${ORDINALS[century - 1]}` : 'سایر سخنوران';
}

export function groupByCentury(poets) {
  const groups = new Map();
  const sorted = poets.slice().sort((a, b) => {
    const ca = centuryOf(a.death) ?? Infinity;
    const cb = centuryOf(b.death) ?? Infinity;
    return ca - cb || a.name.localeCompare(b.name, 'fa');
  });
  for (const p of sorted) {
    const c = centuryOf(p.death);
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(p);
  }
  return [...groups].map(([century, items]) => ({ title: centuryLabel(century), poets: items }));
}
