const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { protect } = require('../middleware/authMiddleware');

// ---------- Public routes ----------
router.post('/initiate', orderController.initiateOrder);
router.post('/confirm', orderController.confirmPayment);

// ---------- Tracking routes (must come before /:id) ----------
router.get('/by-phone', orderController.getOrdersByPhone);
router.get('/by-reference', orderController.getOrdersByReference);

// ---------- Protected ----------
router.get('/', protect, orderController.getUserOrders);

// ---------- Public single order (by ID) ----------
router.get('/:id', orderController.getOrderById);

module.exports = router;
