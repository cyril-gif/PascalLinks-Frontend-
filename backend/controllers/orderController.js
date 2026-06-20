/**
 * controllers/orderController.js
 * ------------------------------------------------
 * Handles order creation, payment confirmation, and retrieval.
 * Integrates with GigsgridService and PaystackService.
 * Performs duplicate check (same beneficiary within 2 minutes).
 */

const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const gigsgridService = require('../services/gigsgridService');
const paystackService = require('../services/paystackService'); // we'll create this next
const { v4: uuidv4 } = require('uuid');

// Helper to calculate markup (e.g., 10% or fixed amount)
const MARKUP_PERCENTAGE = 10; // can be stored in DB or env

/**
 * Calculate final selling price including markup.
 * @param {number} basePrice - price from Gigsgrid (in GHS)
 * @returns {number} - selling price (in GHS)
 */
const applyMarkup = (basePrice) => {
  return basePrice * (1 + MARKUP_PERCENTAGE / 100);
};

/**
 * POST /api/orders/initiate
 * Body: { network, package_size, beneficiary (phone) }
 * 1. Validate input
 * 2. Check for duplicate order within 2 minutes
 * 3. Fetch plan details (from cache or API) to get base price
 * 4. Apply markup
 * 5. Create Order document with status 'pending_payment'
 * 6. Initiate Paystack transaction
 * 7. Return transaction reference and order ID to frontend
 */
exports.initiateOrder = async (req, res) => {
  try {
    const { network, package_size, beneficiary } = req.body;

    // Basic validation
    if (!network || !package_size || !beneficiary) {
      return res.status(400).json({ error: 'Missing required fields: network, package_size, beneficiary' });
    }

    // Validate phone number (simple Ghana format)
    const phoneRegex = /^0[2357]\d{8}$/; // starts with 0, then 2,3,5,7, then 8 digits
    if (!phoneRegex.test(beneficiary)) {
      return res.status(400).json({ error: 'Invalid phone number. Use Ghana format (e.g., 024XXXXXXX)' });
    }

    // Duplicate check: same beneficiary within last 2 minutes
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const recentOrder = await Order.findOne({
      beneficiary,
      createdAt: { $gte: twoMinutesAgo },
      status: { $in: ['pending_payment', 'processing', 'completed'] },
    });
    if (recentOrder) {
      return res.status(409).json({
        error: 'Duplicate order detected. Please wait 2 minutes before trying again.',
      });
    }

    // Fetch plan details to get price
    // We assume the plan object contains a 'price' field in GHS.
    const plans = await gigsgridService.getPlans(network);
    const plan = plans.find(p => p.package_size === package_size);
    if (!plan) {
      return res.status(400).json({ error: 'Invalid package size for the selected network.' });
    }
    const basePrice = plan.price; // in GHS
    const sellingPrice = applyMarkup(basePrice);

    // Create order record
    const order = new Order({
      userId: req.user?._id || null, // if user is logged in
      network,
      package_size,
      beneficiary,
      basePrice,
      sellingPrice,
      status: 'pending_payment',
      // Gigsgrid order id will be filled after payment
    });
    await order.save();

    // Initiate Paystack transaction
    const transactionRef = uuidv4(); // unique reference
    const paystackData = await paystackService.initializeTransaction({
      email: req.user?.email || 'guest@example.com', // fallback
      amount: sellingPrice * 100, // Paystack uses pesewas (GHS * 100)
      reference: transactionRef,
      callback_url: `${process.env.FRONTEND_URL}/payment-callback`,
      metadata: {
        orderId: order._id.toString(),
      },
    });

    // Save transaction record
    const transaction = new Transaction({
      orderId: order._id,
      reference: transactionRef,
      amount: sellingPrice,
      status: 'pending',
      paystackReference: paystackData.reference,
      accessCode: paystackData.access_code,
    });
    await transaction.save();

    // Update order with transaction reference
    order.transactionRef = transactionRef;
    await order.save();

    // Return data to frontend for Paystack popup
    res.status(201).json({
      orderId: order._id,
      transactionRef,
      amount: sellingPrice,
      paystackKey: process.env.PAYSTACK_PUBLIC_KEY,
      accessCode: paystackData.access_code, // optional, for popup
    });
  } catch (error) {
    console.error('Error initiating order:', error);
    res.status(500).json({ error: 'Failed to initiate order. Please try again.' });
  }
};

/**
 * POST /api/orders/confirm
 * This endpoint is called by Paystack webhook or redirect.
 * Body: { reference, status } – we'll verify with Paystack.
 * On success: call Gigsgrid API to place the order.
 */
exports.confirmPayment = async (req, res) => {
  try {
    const { reference, status } = req.body;

    // Verify transaction with Paystack
    const verification = await paystackService.verifyTransaction(reference);
    if (!verification.status || verification.data.status !== 'success') {
      // Update transaction and order as failed
      await Transaction.findOneAndUpdate({ reference }, { status: 'failed' });
      await Order.findOneAndUpdate({ transactionRef: reference }, { status: 'payment_failed' });
      return res.status(400).json({ error: 'Payment not successful.' });
    }

    // Payment successful – update transaction
    await Transaction.findOneAndUpdate({ reference }, { status: 'success' });

    // Find the order
    const order = await Order.findOne({ transactionRef: reference });
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    // Now place the order on Gigsgrid
    const gigsgridOrder = await gigsgridService.createOrder({
      beneficiary: order.beneficiary,
      package_size: order.package_size,
      network_type: order.network,
      webhook_url: `${process.env.BACKEND_URL}/api/webhook/gigsgrid`,
    });

    // Update order with Gigsgrid details
    order.gigsgridOrderId = gigsgridOrder.order_id;
    order.status = 'processing'; // or 'completed' if instant
    order.gigsgridResponse = gigsgridOrder;
    await order.save();

    // Return success (webhook expects 200 OK)
    res.status(200).json({ success: true, orderId: order._id, gigsgridOrderId: gigsgridOrder.order_id });
  } catch (error) {
    console.error('Error confirming payment:', error);
    res.status(500).json({ error: 'Payment confirmation failed.' });
  }
};

/**
 * GET /api/orders
 * Get all orders for the authenticated user.
 */
exports.getUserOrders = async (req, res) => {
  try {
    const userId = req.user._id;
    const orders = await Order.find({ userId }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    console.error('Error fetching user orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders.' });
  }
};

/**
 * GET /api/orders/:id
 * Get a single order by ID (user must own it or be admin).
 */
exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    // Check ownership: if user is not admin, ensure order belongs to them
    if (req.user.role !== 'admin' && order.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Unauthorized access to this order.' });
    }
    res.json(order);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order.' });
  }
};
