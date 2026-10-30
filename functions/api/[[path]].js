import { handle } from '../../lib/ganjoor.js';

export function onRequest({ request, waitUntil }) {
  return handle(request, { cache: caches.default, waitUntil });
}
