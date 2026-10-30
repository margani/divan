import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the version shown in the app is package.json\'s', async () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  const { VERSION } = await import('../public/js/version.js');
  assert.equal(VERSION, pkg.version);
});
