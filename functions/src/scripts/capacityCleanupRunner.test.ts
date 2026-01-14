import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCapacityWrite,
  canApplyWithProject,
  getProjectIdSource,
  parseArgs,
  resolveProjectId,
  validateDateKey,
} from './capacityCleanupRunner';

test('buildCapacityWrite returns delete when slots are invalid', () => {
  const plan = buildCapacityWrite({
    totalCount: 2,
    count: 2,
    byTimeSlot: { afternoon: -1, evening: 1 },
  });
  assert.deepEqual(plan, {
    payload: { totalCount: 2, count: 2 },
    deletesSlots: true,
  });
});

test('buildCapacityWrite returns payload when counts mismatch only', () => {
  const plan = buildCapacityWrite({
    totalCount: 3,
    count: 1,
  });
  assert.deepEqual(plan, {
    payload: { totalCount: 3, count: 3 },
    deletesSlots: false,
  });
});

test('buildCapacityWrite returns null when no cleanup is needed', () => {
  const plan = buildCapacityWrite({
    totalCount: 2,
    count: 2,
  });
  assert.equal(plan, null);
});

test('buildCapacityWrite includes byTimeSlot when normalized keeps it', () => {
  const plan = buildCapacityWrite({
    totalCount: 2,
    count: 1,
    byTimeSlot: { afternoon: 2 },
  });
  assert.deepEqual(plan, {
    payload: { totalCount: 2, count: 2, byTimeSlot: { afternoon: 2 } },
    deletesSlots: false,
  });
});

test('validateDateKey enforces YYYY-MM-DD', () => {
  assert.equal(validateDateKey('2024-01-05'), true);
  assert.equal(validateDateKey('2024-1-05'), false);
  assert.equal(validateDateKey('2024-13-01'), true);
  assert.equal(validateDateKey(''), false);
  assert.equal(validateDateKey(undefined), false);
});

test('resolveProjectId prefers CLI arg', () => {
  const originalProjectId = process.env.PROJECT_ID;
  process.env.PROJECT_ID = 'env-project';
  try {
    assert.equal(resolveProjectId('cli-project'), 'cli-project');
  } finally {
    if (originalProjectId === undefined) {
      delete process.env.PROJECT_ID;
    } else {
      process.env.PROJECT_ID = originalProjectId;
    }
  }
});

test('resolveProjectId falls back to env vars', () => {
  const originalProjectId = process.env.PROJECT_ID;
  const originalEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  delete process.env.FIRESTORE_EMULATOR_HOST;
  process.env.PROJECT_ID = 'env-project';
  try {
    assert.equal(resolveProjectId(undefined), 'env-project');
  } finally {
    if (originalProjectId === undefined) {
      delete process.env.PROJECT_ID;
    } else {
      process.env.PROJECT_ID = originalProjectId;
    }
    if (originalEmulatorHost === undefined) {
      delete process.env.FIRESTORE_EMULATOR_HOST;
    } else {
      process.env.FIRESTORE_EMULATOR_HOST = originalEmulatorHost;
    }
  }
});

test('resolveProjectId falls back to emulator default', () => {
  const originalProjectId = process.env.PROJECT_ID;
  const originalEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  delete process.env.PROJECT_ID;
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
  try {
    assert.equal(resolveProjectId(undefined), 'demo-mintleaf');
  } finally {
    if (originalProjectId === undefined) {
      delete process.env.PROJECT_ID;
    } else {
      process.env.PROJECT_ID = originalProjectId;
    }
    if (originalEmulatorHost === undefined) {
      delete process.env.FIRESTORE_EMULATOR_HOST;
    } else {
      process.env.FIRESTORE_EMULATOR_HOST = originalEmulatorHost;
    }
  }
});

test('parseArgs uses last duplicate value', () => {
  const args = parseArgs(['--limit=200', '--limit=50']);
  assert.equal(args.limit, '50');
});

test('parseArgs reads projectId', () => {
  const args = parseArgs(['--projectId=mintleaf-74d27']);
  assert.equal(args.projectId, 'mintleaf-74d27');
});

test('parseArgs reports unknown flags', () => {
  const args = parseArgs(['--not-real']);
  assert.deepEqual(args.unknownFlags, ['--not-real']);
});

test('parseArgs ignores empty projectId', () => {
  const args = parseArgs(['--projectId=']);
  assert.equal(args.projectId, undefined);
});

test('getProjectIdSource prefers cli', () => {
  const originalProjectId = process.env.PROJECT_ID;
  const originalEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  process.env.PROJECT_ID = 'env-project';
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
  try {
    assert.equal(getProjectIdSource('cli-project'), 'cli');
  } finally {
    if (originalProjectId === undefined) {
      delete process.env.PROJECT_ID;
    } else {
      process.env.PROJECT_ID = originalProjectId;
    }
    if (originalEmulatorHost === undefined) {
      delete process.env.FIRESTORE_EMULATOR_HOST;
    } else {
      process.env.FIRESTORE_EMULATOR_HOST = originalEmulatorHost;
    }
  }
});

test('getProjectIdSource prefers env over emulator', () => {
  const originalProjectId = process.env.PROJECT_ID;
  const originalEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  process.env.PROJECT_ID = 'env-project';
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
  try {
    assert.equal(getProjectIdSource(undefined), 'env');
  } finally {
    if (originalProjectId === undefined) {
      delete process.env.PROJECT_ID;
    } else {
      process.env.PROJECT_ID = originalProjectId;
    }
    if (originalEmulatorHost === undefined) {
      delete process.env.FIRESTORE_EMULATOR_HOST;
    } else {
      process.env.FIRESTORE_EMULATOR_HOST = originalEmulatorHost;
    }
  }
});

test('getProjectIdSource uses emulator fallback', () => {
  const originalProjectId = process.env.PROJECT_ID;
  const originalEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  delete process.env.PROJECT_ID;
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
  try {
    assert.equal(getProjectIdSource(undefined), 'emulator');
  } finally {
    if (originalProjectId === undefined) {
      delete process.env.PROJECT_ID;
    } else {
      process.env.PROJECT_ID = originalProjectId;
    }
    if (originalEmulatorHost === undefined) {
      delete process.env.FIRESTORE_EMULATOR_HOST;
    } else {
      process.env.FIRESTORE_EMULATOR_HOST = originalEmulatorHost;
    }
  }
});

test('getProjectIdSource returns none when no sources', () => {
  const originalProjectId = process.env.PROJECT_ID;
  const originalEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  delete process.env.PROJECT_ID;
  delete process.env.FIRESTORE_EMULATOR_HOST;
  try {
    assert.equal(getProjectIdSource(undefined), 'none');
  } finally {
    if (originalProjectId === undefined) {
      delete process.env.PROJECT_ID;
    } else {
      process.env.PROJECT_ID = originalProjectId;
    }
    if (originalEmulatorHost === undefined) {
      delete process.env.FIRESTORE_EMULATOR_HOST;
    } else {
      process.env.FIRESTORE_EMULATOR_HOST = originalEmulatorHost;
    }
  }
});

test('canApplyWithProject rejects emulator default', () => {
  assert.equal(canApplyWithProject('demo-mintleaf', 'emulator'), false);
});

test('canApplyWithProject rejects undefined projectId', () => {
  assert.equal(canApplyWithProject(undefined, 'cli'), false);
});

test('canApplyWithProject allows cli/env real projectId', () => {
  assert.equal(canApplyWithProject('mintleaf-74d27', 'cli'), true);
  assert.equal(canApplyWithProject('mintleaf-74d27', 'env'), true);
});
