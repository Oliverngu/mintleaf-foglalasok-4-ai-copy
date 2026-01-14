import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildLoaderRegister } from './testLoaderRegister.mjs';

const nodeVersion = process.version;
const nodeMajor = Number.parseInt(nodeVersion.replace(/^v/, '').split('.')[0] || '0', 10);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');
const uiDir = resolve(repoRoot, 'src', 'ui');
const { loaderPath, loaderRegister } = buildLoaderRegister(repoRoot);

const findTestFiles = dir => {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findTestFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }
  return files;
};

const testFiles = findTestFiles(uiDir);
if (testFiles.length === 0) {
  console.error('[test-ui] no test files found under src/ui');
  process.exit(1);
}

if (nodeMajor < 22) {
  console.error(
    `[test-ui] Node 22+ required (strip-types). Current: ${nodeVersion}. ` +
      'Please upgrade to Node 22+ to run UI tests.'
  );
  process.exit(1);
}

console.log(
  `[test-ui] node=${nodeVersion} mode=node-test-strip-types tests=${testFiles.length}`
);
if (!existsSync(loaderPath)) {
  console.error(
    `[test-ui] loader not found at ${loaderPath}. Expected repo root layout with src/scripts/tsModuleLoader.mjs`
  );
  process.exit(1);
}
const result = spawnSync(
  'node',
  [
    '--experimental-strip-types',
    '--import',
    loaderRegister,
    '--experimental-detect-module',
    '--test',
    ...testFiles,
  ],
  { stdio: 'inherit' }
);
process.exit(result.status ?? 1);
