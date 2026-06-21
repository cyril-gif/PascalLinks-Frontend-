const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { protect } = require('../middleware/authMiddleware');

// Public
router.post('/initiate', orderController.initiateOrder);
router.post('/confirm', orderController.confirmPayment);

// Protected
router.get('/', protect, orderController.getUserOrders);

// Public tracking routes
router.get('/by-phone', orderController.getOrdersByPhone);
router.get('/by-reference', orderController.getOrdersByReference);
router.get('/:id', orderController.getOrderById);

module.exports = router;
