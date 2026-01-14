import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve as resolvePath } from 'node:path';

import { buildLoaderRegister } from './testLoaderRegister.mjs';

const repoRoot = resolvePath('.');

test('buildLoaderRegister returns expected loader paths', () => {
  const { loaderPath } = buildLoaderRegister(repoRoot);
  assert.ok(loaderPath.endsWith('src/scripts/tsModuleLoader.mjs'));
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
