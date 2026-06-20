/**
 * routes/auth.js
 * ------------------------------------------------
 * Authentication routes: register, login, get profile.
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { authLimiter } = require('../middleware/rateLimiter');

// Public routes (with rate limiting)
router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);

// Protected route: get current user profile
router.get('/profile', protect, authController.getProfile);

module.exports = router;
