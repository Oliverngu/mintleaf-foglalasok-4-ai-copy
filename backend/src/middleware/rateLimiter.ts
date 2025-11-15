import { rateLimit } from 'express-rate-limit';

/**
 * Rate limiter for login attempts to prevent brute-force attacks.
 * Limits each IP to 5 login requests per 15-minute window.
 */
export const loginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	limit: 5,
	standardHeaders: 'draft-7',
	legacyHeaders: false,
    message: 'Too many login attempts from this IP, please try again after 15 minutes.',
});

/**
 * Rate limiter for anonymous feedback submissions to prevent spam.
 * Limits each IP to 1 request per 30 seconds.
 */
export const feedbackLimiter = rateLimit({
    windowMs: 30 * 1000, // 30 seconds
    limit: 1,
    standardHeaders: 'draft-7',
	legacyHeaders: false,
    message: 'You can only submit feedback once every 30 seconds.',
});
