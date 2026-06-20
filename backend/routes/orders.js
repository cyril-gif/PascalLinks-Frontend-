/**
 * routes/orders.js
 * ------------------------------------------------
 * Defines RESTful routes for order management.
 * Uses `protect` middleware for authenticated endpoints.
 */

const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { protect } = require('../middleware/authMiddleware');   // ✅ import protect

// Public: initiate an order (creates Paystack transaction)
router.post('/initiate', orderController.initiateOrder);

// Public: confirm payment (called by Paystack redirect/webhook)
router.post('/confirm', orderController.confirmPayment);

// Protected: get all orders for the logged‑in user
router.get('/', protect, orderController.getUserOrders);

// Public: get a specific order by ID (for status page – guests allowed)
router.get('/:id', orderController.getOrderById);

module.exports = router;
