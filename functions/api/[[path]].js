import { handle } from '../../lib/ganjoor.js';

export function onRequest({ request, waitUntil, env }) {
  return handle(request, { cache: caches.default, waitUntil, version: env.CF_PAGES_COMMIT_SHA || null });
}
