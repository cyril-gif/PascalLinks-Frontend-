/**
 * routes/orders.js
 * ------------------------------------------------
 * Defines RESTful routes for order management.
 * Uses `protect` middleware for authenticated endpoints.
 */

const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { protect } = require('../middleware/authMiddleware');

// Public: initiate an order (creates Paystack transaction)
router.post('/initiate', orderController.initiateOrder);

// Public: confirm payment (called by Paystack redirect/webhook)
router.post('/confirm', orderController.confirmPayment);

// Protected: get all orders for the logged‑in user
router.get('/', protect, orderController.getUserOrders);

// Public: get a specific order by ID (for status page – guests allowed)
router.get('/:id', orderController.getOrderById);

// Public: get orders by phone number (for tracking)
router.get('/by-phone', orderController.getOrdersByPhone);

// Public: get orders by transaction reference (for tracking)
router.get('/by-reference', orderController.getOrdersByReference);

module.exports = router;
