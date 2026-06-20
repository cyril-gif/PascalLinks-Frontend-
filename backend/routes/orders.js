/**
 * routes/orders.js
 * ------------------------------------------------
 * Defines RESTful routes for order management.
 * All routes are protected by JWT authentication except the initiation
 * (which may be guest checkout) – we'll protect only GET endpoints.
 */

const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const authMiddleware = require('../middleware/authMiddleware');

// Public: initiate an order (creates Paystack transaction)
router.post('/initiate', orderController.initiateOrder);

// Public: confirm payment (called by Paystack redirect/webhook)
router.post('/confirm', orderController.confirmPayment);

// Protected: get all orders for the logged‑in user
router.get('/', authMiddleware, orderController.getUserOrders);

// Protected: get a specific order by ID
router.get('/:id', authMiddleware, orderController.getOrderById);

// Admin: update order status (manual retry, etc.) – we'll add later in admin routes
// For now, we keep it minimal.

module.exports = router;
