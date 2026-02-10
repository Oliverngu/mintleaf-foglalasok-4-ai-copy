import { Timestamp } from 'firebase/firestore';
import {
  applySuggestionToSchedule,
  undoPatches
} from './engineWhatIf';
import { Suggestion } from '../../../core/scheduling/engine/types';
import { Shift, User, Position } from '../../../core/models/data';

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const positions: Position[] = [{ id: 'p1', name: 'Pult' }];
const users: User[] = [
  {
    id: 'u1',
    name: 'User',
    lastName: 'User',
    firstName: 'One',
    fullName: 'User One',
    email: 'user@example.com',
    role: 'User'
  }
];

const baseShift = (id: string, start: Date, end: Date): Shift => ({
  id,
  userId: 'u1',
  userName: 'User One',
  unitId: 'unit-a',
  position: 'Pult',
  start: Timestamp.fromDate(start),
  end: Timestamp.fromDate(end),
  status: 'draft'
});

const testMoveShiftApplyUndo = () => {
  const start = new Date('2025-01-06T08:00:00');
  const end = new Date('2025-01-06T12:00:00');
  const schedule = [baseShift('s1', start, end)];

  const suggestion: Suggestion = {
    type: 'SHIFT_MOVE_SUGGESTION',
    actions: [
      {
        type: 'moveShift',
        shiftId: 's1',
        userId: 'u1',
        dateKey: '2025-01-06',
        newStartTime: '10:00',
        newEndTime: '14:00',
        positionId: 'p1'
      }
    ],
    expectedImpact: 'test',
    explanation: 'test'
  };

  const { nextSchedule, patches } = applySuggestionToSchedule(schedule, suggestion, {
    unitId: 'unit-a',
    users,
    positions
  });

  assert(nextSchedule[0].start?.toDate().getHours() === 10, 'Move should update start.');
  assert(nextSchedule[0].end?.toDate().getHours() === 14, 'Move should update end.');

  const undone = undoPatches(nextSchedule, patches);
  assert(undone[0].start?.toDate().getHours() === 8, 'Undo should restore start.');
  assert(undone[0].end?.toDate().getHours() === 12, 'Undo should restore end.');
};

const testCreateShiftApplyUndo = () => {
  const schedule: Shift[] = [];
  const suggestion: Suggestion = {
    type: 'ADD_SHIFT_SUGGESTION',
    actions: [
      {
        type: 'createShift',
        userId: 'u1',
        dateKey: '2025-01-06',
        startTime: '09:00',
        endTime: '12:00',
        positionId: 'p1'
      }
    ],
    expectedImpact: 'test',
    explanation: 'test'
  };

  const { nextSchedule, patches } = applySuggestionToSchedule(schedule, suggestion, {
    unitId: 'unit-a',
    users,
    positions
  });

  assert(nextSchedule.length === 1, 'Create should add a shift.');

  const undone = undoPatches(nextSchedule, patches);
  assert(undone.length === 0, 'Undo should remove created shift.');
};

const runTests = () => {
  testMoveShiftApplyUndo();
  testCreateShiftApplyUndo();
};

runTests();
