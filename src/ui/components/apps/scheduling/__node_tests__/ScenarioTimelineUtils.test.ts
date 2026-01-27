import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { rangesOverlap } from '../ScenarioTimelineUtils.js';

describe('rangesOverlap', () => {
  it('detects overlap for same-day ranges', () => {
    assert.equal(rangesOverlap('10:00', '12:00', '11:00', '13:00'), true);
    assert.equal(rangesOverlap('10:00', '12:00', '12:00', '13:00'), false);
  });

  it('handles cross-midnight ranges', () => {
    assert.equal(rangesOverlap('22:00', '02:00', '01:00', '03:00'), true);
    assert.equal(rangesOverlap('22:00', '02:00', '03:00', '04:00'), false);
  });
});
