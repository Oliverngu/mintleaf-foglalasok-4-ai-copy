import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildLoaderRegister } from '../../../src/scripts/testLoaderRegister.mjs';

const nodeVersion = process.version;
const nodeMajor = Number.parseInt(nodeVersion.replace(/^v/, '').split('.')[0] || '0', 10);
const supportsStripTypes = nodeMajor >= 22;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..', '..');
const functionsRoot = resolve(repoRoot, 'functions');
const srcDir = resolve(functionsRoot, 'src');
const { loaderPath, loaderRegister } = buildLoaderRegister(repoRoot);

const findTestFiles = dir => {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'lib') {
      continue;
    }
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findTestFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }
  return files;
};

const testFiles = findTestFiles(srcDir);
if (testFiles.length === 0) {
  console.error(`[test-unit] no test files found under ${srcDir}`);
  process.exit(1);
}

if (supportsStripTypes) {
  if (!existsSync(loaderPath)) {
    console.error(
      `[test-unit] loader not found at ${loaderPath}. Expected repo root layout with src/scripts/tsModuleLoader.mjs`
    );
    process.exit(1);
  }
  console.log(`[test-unit] node=${nodeVersion} mode=node-test-strip-types`);
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
}

console.log(`[test-unit] node=${nodeVersion} mode=tsx`);
try {
  execSync('npm exec -- tsx --version', { stdio: 'inherit' });
} catch (err) {
  console.error('[test-unit] tsx is required for Node < 22 test runs');
  process.exit(1);
}

const result = spawnSync('npm', ['exec', '--', 'tsx', '--test', 'src/**/*.test.ts'], {
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
