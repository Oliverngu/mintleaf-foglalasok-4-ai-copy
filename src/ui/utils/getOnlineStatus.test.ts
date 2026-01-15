import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getOnlineStatus } from './getOnlineStatus';

test('getOnlineStatus returns explicit true', () => {
  assert.equal(getOnlineStatus(true), true);
});

test('getOnlineStatus returns explicit false', () => {
  assert.equal(getOnlineStatus(false), false);
});

test('getOnlineStatus returns undefined when navigator is unavailable', () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const canOverride = !originalNavigator || originalNavigator.configurable;
  try {
    if (canOverride) {
      Object.defineProperty(globalThis, 'navigator', {
        value: undefined,
        configurable: true,
        writable: true,
      });
    }
    const status = getOnlineStatus();
    if (canOverride) {
      assert.equal(status, undefined);
    } else {
      assert.equal(typeof status === 'boolean' || typeof status === 'undefined', true);
    }
  } finally {
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', originalNavigator);
    } else if (canOverride) {
      delete (globalThis as { navigator?: Navigator }).navigator;
    }
  }
});
