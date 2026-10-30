// The payload shape this code expects; test/version.test.js keeps it equal
// to SHAPE_VERSION in lib/ganjoor.js. It goes into every /api URL because a
// returning reader's old service worker stays in control until they tap
// «به‌روزرسانی», serving new code but answering /api from its own cache,
// keyed by URL: 0.8.0's songs filter got 0.7.0's payload and vanished (#35).
// The edge cache key ignores the extra parameter.
export const API_SHAPE = 5;

export function api(path) {
  return `${path}${path.includes('?') ? '&' : '?'}shape=${API_SHAPE}`;
}
