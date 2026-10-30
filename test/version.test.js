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
