import rateLimit from 'express-rate-limit';

// Agent API rate limit — generous to allow multi-step agent loops
export const rateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Too many requests, please slow down.' },
});
