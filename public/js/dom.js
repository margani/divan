// Builds DOM with textContent only: poem text and bios come from a third
// party, so nothing from the API is ever parsed as HTML.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else el.setAttribute(k, v);
  }
  el.append(...nodes(children));
  return el;
}

// Sections are built as nested arrays with `cond && [...]`; DOM append would
// stringify those, so flatten and drop the empty parts first.
export function nodes(children) {
  return children.flat(Infinity).filter((c) => c != null && c !== false);
}
