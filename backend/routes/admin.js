/**
 * routes/admin.js
 * ------------------------------------------------
 * Admin-only routes for managing orders, wallet, verifications,
 * pricing, and analytics.
 * All routes are protected by authentication and admin middleware.
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Apply authentication and admin check to all routes
router.use(protect);
router.use(adminOnly);

// Orders management
router.get('/orders', adminController.getAllOrders);
router.get('/orders/:id', adminController.getOrderById);
router.post('/orders/:id/retry', adminController.retryOrder);

// Wallet / balance (from Gigsgrid)
router.get('/wallet', adminController.getWalletBalance);

// Pending verifications
router.get('/pending-verifications', adminController.getPendingVerifications);
router.post('/verify-topup', adminController.verifyTopup);

// Pricing settings
router.get('/settings', adminController.getSettings);
router.put('/settings', adminController.updateSettings);

// Analytics
router.get('/analytics', adminController.getAnalytics);

module.exports = router;
