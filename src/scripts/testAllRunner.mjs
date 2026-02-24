import { spawnSync } from 'node:child_process';

const allSteps = [
  {
    label: 'test:scripts',
    command: ['npm', ['run', 'test:scripts']],
  },
  {
    label: 'test:ui',
    command: ['npm', ['run', 'test:ui']],
  },
  {
    label: 'functions:test:unit',
    command: ['npm', ['--prefix', 'functions', 'run', 'test:unit']],
  },
  {
    label: 'functions:test:contract',
    command: ['npm', ['--prefix', 'functions', 'run', 'test:contract']],
  },
];

const args = new Set(process.argv.slice(2));
const forceFull = args.has('--full');
const quickMode = args.has('--quick');
const includeContract = args.has('--contract');
const allowContract = !quickMode || includeContract;

let steps = [];
let planReason = 'default full run';
let baseRef = null;
let changedFiles = [];
let diffAvailable = false;

const gitVersion = spawnSync('git', ['--version'], { encoding: 'utf8' });
const gitAvailable = gitVersion.status === 0;
if (gitAvailable) {
  const envBaseRef = process.env.TEST_ALL_BASE_REF;
  baseRef = envBaseRef || null;
  if (!baseRef) {
    const hasOriginMain = spawnSync('git', ['show-ref', '--verify', '--quiet', 'refs/remotes/origin/main']);
    if (hasOriginMain.status === 0) {
      const mergeBase = spawnSync('git', ['merge-base', 'HEAD', 'origin/main'], { encoding: 'utf8' });
      if (mergeBase.status === 0) {
        baseRef = mergeBase.stdout.trim();
      }
    } else {
      const hasMain = spawnSync('git', ['show-ref', '--verify', '--quiet', 'refs/heads/main']);
      if (hasMain.status === 0) {
        const mergeBase = spawnSync('git', ['merge-base', 'HEAD', 'main'], { encoding: 'utf8' });
        if (mergeBase.status === 0) {
          baseRef = mergeBase.stdout.trim();
        }
      }
    }
  }

  if (!baseRef) {
    const headFallback = spawnSync('git', ['rev-parse', 'HEAD~1'], { encoding: 'utf8' });
    if (headFallback.status === 0) {
      baseRef = headFallback.stdout.trim();
    }
  }

  if (baseRef) {
    const diff = spawnSync('git', ['diff', '--name-only', `${baseRef}...HEAD`], { encoding: 'utf8' });
    if (diff.status === 0) {
      changedFiles = diff.stdout
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
      diffAvailable = true;
    }
  }
}

let wantScripts = false;
let wantUi = false;
let wantFunctionsUnit = false;
let wantFunctionsContractByDiff = false;

if (forceFull) {
  wantScripts = true;
  wantUi = true;
  wantFunctionsUnit = true;
  planReason = 'forced full';
} else if (diffAvailable && changedFiles.length > 0) {
  wantScripts =
    changedFiles.some(file => file.startsWith('src/scripts/')) || changedFiles.includes('package.json');
  wantUi = changedFiles.some(file => file.startsWith('src/ui/')) || changedFiles.includes('package.json');
  wantFunctionsUnit = changedFiles.some(file => file.startsWith('functions/'));
  wantFunctionsContractByDiff =
    changedFiles.some(file => file.startsWith('functions/src/')) || changedFiles.includes('functions/package.json');
  planReason = `diff matched (${changedFiles.length} files)`;
  if (!wantScripts && !wantUi && !wantFunctionsUnit) {
    wantScripts = true;
    wantUi = true;
    wantFunctionsUnit = true;
    planReason = 'diff had no suite matches';
  }
} else {
  wantScripts = true;
  wantUi = true;
  wantFunctionsUnit = true;
  planReason = diffAvailable ? 'fallback (no changes)' : 'fallback (no diff)';
}

const wantFunctionsContract = allowContract && (forceFull || wantFunctionsContractByDiff || includeContract);

if (wantScripts) {
  steps.push(allSteps.find(step => step.label === 'test:scripts'));
}
if (wantUi) {
  steps.push(allSteps.find(step => step.label === 'test:ui'));
}
if (wantFunctionsUnit) {
  steps.push(allSteps.find(step => step.label === 'functions:test:unit'));
}
if (wantFunctionsContract) {
  steps.push(allSteps.find(step => step.label === 'functions:test:contract'));
}

steps = steps.filter(Boolean);
const stepLabels = steps.map(step => step.label);
console.log(
  `[test-all] flags: quick=${quickMode} full=${forceFull} contract=${includeContract}`
);
console.log(
  `[test-all] baseRef=${baseRef ?? 'none'} changed=${changedFiles.length} plan=${stepLabels.join(
    ', '
  )} (${planReason})`
);

for (const step of steps) {
  const [cmd, args] = step.command;
  const startTime = Date.now();
  console.log(`\n[test-all] running ${step.label}...`);
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  const endTime = Date.now();
  const durationSeconds = ((endTime - startTime) / 1000).toFixed(2);
  if (result.status === 0) {
    console.log(`[test-all] ✅ ${step.label} passed (${durationSeconds}s)`);
  } else {
    const commandText = [cmd, ...args].join(' ');
    console.log(`[test-all] ❌ FAILED ${step.label}`);
    console.log(`command: ${commandText}`);
    console.log(`exitCode: ${result.status ?? 1}`);
    console.log(`duration: ${durationSeconds}s`);
    process.exit(result.status ?? 1);
  }
}

process.exit(0);
