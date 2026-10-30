import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the version shown in the app is package.json\'s', async () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  const { VERSION } = await import('../public/js/version.js');
  assert.equal(VERSION, pkg.version);
});

test('sw.js carries the app version, so every release is a detectable update', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.equal(sw.match(/^const VERSION = '([^']+)';/m)?.[1], pkg.version);
});

// A returning reader's old service worker answers /api from its own cache,
// keyed by URL (#35): the page's API URLs must change with the payload shape.
test('the page asks for the API payload shape the server builds', async () => {
  const { SHAPE_VERSION } = await import('../lib/ganjoor.js');
  const { API_SHAPE, api } = await import('../public/js/api.js');
  assert.equal(API_SHAPE, SHAPE_VERSION);
  assert.equal(api('/api/sung'), `/api/sung?shape=${SHAPE_VERSION}`);
  assert.equal(api('/api/songs?poem=1'), `/api/songs?poem=1&shape=${SHAPE_VERSION}`);
});

test('every /api request in the page goes through api()', () => {
  for (const file of ['app.js', 'sung.js', 'songs.js', 'player.js', 'home.js', 'finder.js']) {
    const src = readFileSync(new URL(`../public/js/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /fetch\(\s*[`'"]\/api\//, `${file} fetches /api directly`);
    assert.doesNotMatch(src, /getJson\(\s*[`'"]\/api\//, `${file} reads /api directly`);
  }
});
