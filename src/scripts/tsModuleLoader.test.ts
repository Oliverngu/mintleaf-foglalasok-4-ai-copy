import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolve as resolveModule } from './tsModuleLoader.mjs';

const fixturesDir = resolvePath('src', 'scripts', '__fixtures__', 'tsModuleLoader');
const parentUrl = pathToFileURL(resolvePath(fixturesDir, 'entry.ts')).href;

const defaultResolve = () => {
  throw new Error('defaultResolve should not be called');
};

test('tsModuleLoader resolves .ts for extensionless specifier', async () => {
  const result = await resolveModule('./tsFile', { parentURL: parentUrl }, defaultResolve);
  assert.equal(
    result.url,
    pathToFileURL(resolvePath(fixturesDir, 'tsFile.ts')).href
  );
});

test('tsModuleLoader resolves .tsx for extensionless specifier', async () => {
  const result = await resolveModule('./tsxFile', { parentURL: parentUrl }, defaultResolve);
  assert.equal(
    result.url,
    pathToFileURL(resolvePath(fixturesDir, 'tsxFile.tsx')).href
  );
});

test('tsModuleLoader resolves index.ts for folder specifier', async () => {
  const result = await resolveModule('./folder', { parentURL: parentUrl }, defaultResolve);
  assert.equal(
    result.url,
    pathToFileURL(resolvePath(fixturesDir, 'folder', 'index.ts')).href
  );
});

test('tsModuleLoader resolves index.tsx for folder specifier', async () => {
  const result = await resolveModule('./folder-tsx', { parentURL: parentUrl }, defaultResolve);
  assert.equal(
    result.url,
    pathToFileURL(resolvePath(fixturesDir, 'folder-tsx', 'index.tsx')).href
  );
});
