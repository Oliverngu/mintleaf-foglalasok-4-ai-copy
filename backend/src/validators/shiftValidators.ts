import { z } from 'zod';

const MAX_SHIFT_DURATION_HOURS = 16;
const MAX_NOTE_LENGTH = 255;

export const createShiftSchema = z.object({
  body: z.object({
    userId: z.string().uuid('Invalid user ID format'),
    unitId: z.string().uuid('Invalid unit ID format'),
    start: z.string().datetime('Start time must be a valid ISO 8601 date string'),
    end: z.string().datetime('End time must be a valid ISO 8601 date string').optional().nullable(),
    note: z.string().max(MAX_NOTE_LENGTH, `Note cannot exceed ${MAX_NOTE_LENGTH} characters`).optional(),
  }).refine(data => {
      // End time, if provided, must be after start time
      if (data.end) {
          return new Date(data.end) > new Date(data.start);
      }
      return true;
    }, {
      message: 'End time must be after start time',
      path: ['end'],
    })
    .refine(data => {
        // Enforce max shift duration
        if (data.end) {
            const durationMs = new Date(data.end).getTime() - new Date(data.start).getTime();
            const durationHours = durationMs / (1000 * 60 * 60);
            return durationHours <= MAX_SHIFT_DURATION_HOURS;
        }
        return true;
    }, {
        message: `Shift duration cannot exceed ${MAX_SHIFT_DURATION_HOURS} hours`,
        path: ['end'],
    })
});

export const updateShiftSchema = z.object({
  body: z.object({
    // All fields are optional for update
    userId: z.string().uuid('Invalid user ID format').optional(),
    unitId: z.string().uuid('Invalid unit ID format').optional(),
    start: z.string().datetime('Start time must be a valid ISO 8601 date string').optional(),
    end: z.string().datetime('End time must be a valid ISO 8601 date string').optional().nullable(),
    note: z.string().max(MAX_NOTE_LENGTH, `Note cannot exceed ${MAX_NOTE_LENGTH} characters`).optional().nullable(),
  }),
  params: z.object({
      id: z.string().uuid('Invalid shift ID format in URL parameter'),
  })
}).refine(data => {
    // Cross-field validation: if both start and end are provided, end must be after start
    if (data.body.start && data.body.end) {
        return new Date(data.body.end) > new Date(data.body.start);
    }
    return true;
}, {
    message: 'End time must be after start time',
    path: ['body', 'end'],
});
