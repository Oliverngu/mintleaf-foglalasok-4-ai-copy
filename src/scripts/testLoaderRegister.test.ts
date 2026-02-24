import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildLoaderRegister } from './testLoaderRegister.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolvePath(__dirname, '..', '..');

test('buildLoaderRegister returns expected loader paths', () => {
  const { loaderPath } = buildLoaderRegister(repoRoot);
  const expectedPath = resolvePath(repoRoot, 'src', 'scripts', 'tsModuleLoader.mjs');
  assert.equal(loaderPath, expectedPath);
});

test('buildLoaderRegister returns base URL with trailing slash', () => {
  const { loaderBaseUrl } = buildLoaderRegister(repoRoot);
  assert.ok(loaderBaseUrl.endsWith('/'));
});

test('buildLoaderRegister embeds loader values in register snippet', () => {
  const { loaderUrl, loaderBaseUrl, loaderRegister } = buildLoaderRegister(repoRoot);
  assert.ok(loaderRegister.includes('register('));
  assert.ok(loaderRegister.includes(JSON.stringify(loaderUrl)));
  assert.ok(loaderRegister.includes(JSON.stringify(loaderBaseUrl)));
});
