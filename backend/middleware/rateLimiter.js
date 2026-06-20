/**
 * middleware/rateLimiter.js
 * ------------------------------------------------
 * Rate limiting middleware to prevent abuse on sensitive endpoints.
 * Uses a simple in‑memory store (for development); in production, use Redis.
 */

const rateLimit = require('express-rate-limit');

// General limiter: 100 requests per 15 minutes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter limiter for order initiation: 10 per minute
const orderLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: { error: 'Too many order attempts. Please wait a moment.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth limiter: 5 attempts per 5 minutes (to prevent brute force)
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  message: { error: 'Too many authentication attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { generalLimiter, orderLimiter, authLimiter };
