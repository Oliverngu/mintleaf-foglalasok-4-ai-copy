import { execSync, spawnSync } from 'node:child_process';

const nodeVersion = process.version;
let npmVersion = 'unknown';

try {
  npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
} catch (err) {
  console.error('[test-contract] failed to read npm version', err);
  process.exit(1);
}

console.log(`[test-contract] node=${nodeVersion} npm=${npmVersion} cwd=${process.cwd()}`);

const result = spawnSync('npm', ['run', 'test:unit'], {
  stdio: 'inherit',
});

if (result.status === 0) {
  console.log('[test-contract] result=pass');
  process.exit(0);
}

const exitCode = result.status ?? 1;
console.error(`[test-contract] result=fail exitCode=${exitCode}`);
process.exit(exitCode);
