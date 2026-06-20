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
const paystackService = require('../services/paystackService');
const { v4: uuidv4 } = require('uuid');

// Markup to sell 1GB for 4.60 when base is 3.80
const MARKUP_PERCENTAGE = 21.05; // 21.05% markup

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
 */
exports.initiateOrder = async (req, res) => {
  try {
    const { network, package_size, beneficiary } = req.body;

    // Basic validation
    if (!network || !package_size || !beneficiary) {
      return res.status(400).json({ error: 'Missing required fields: network, package_size, beneficiary' });
    }

    // Validate phone number (Ghana format)
    const phoneRegex = /^0[2357]\d{8}$/;
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

    // ✅ Fetch plan details to get price
    const plans = await gigsgridService.getPlans(network);
    console.log('🔍 Plans fetched:', plans.length);
    
    // Find the plan - match by package_size (e.g., "1GB")
    const plan = plans.find(p => p.package_size === package_size);
    if (!plan) {
      console.error('❌ Plan not found for:', package_size, 'in', plans.map(p => p.package_size));
      return res.status(400).json({ error: 'Invalid package size for the selected network.' });
    }

    console.log('✅ Found plan:', plan);

    const basePrice = plan.price;
    // ✅ Apply markup to get selling price
    const sellingPrice = applyMarkup(basePrice);
    
    console.log('💰 Base price:', basePrice, '→ Selling price:', sellingPrice);

    // Create order record
    const order = new Order({
      userId: req.user?._id || null,
      network,
      package_size,
      beneficiary,
      basePrice,
      sellingPrice,
      status: 'pending_payment',
    });
    await order.save();

    // ✅ Initiate Paystack transaction
    const transactionRef = uuidv4();

    // ✅ Convert to pesewas (integer) – Paystack requires integer
    const amountInPesewas = Math.round(sellingPrice * 100);
    console.log('💳 Amount to Paystack:', amountInPesewas, 'pesewas (', sellingPrice, 'GHS)');

    const paystackData = await paystackService.initializeTransaction({
      email: req.user?.email || 'customer@example.com',
      amount: amountInPesewas, // ✅ Now an integer (e.g., 460)
      reference: transactionRef,
      callback_url: `${process.env.FRONTEND_URL}/payment-callback.html`,
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

    // ✅ Return data to frontend (including selling price)
    res.status(201).json({
      orderId: order._id,
      transactionRef,
      amount: sellingPrice, // ✅ Send the markup price (e.g., 4.60)
      paystackKey: process.env.PAYSTACK_PUBLIC_KEY,
      accessCode: paystackData.access_code,
    });
  } catch (error) {
    console.error('❌ Initiate order error:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({
      error: 'Failed to initiate order. Please try again.',
      details: error.message,
    });
  }
};

/**
 * POST /api/orders/confirm
 * Called by Paystack webhook or redirect.
 */
exports.confirmPayment = async (req, res) => {
  try {
    const { reference, status } = req.body;

    // Verify transaction with Paystack
    const verification = await paystackService.verifyTransaction(reference);
    if (!verification.status || verification.data.status !== 'success') {
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
    order.status = 'processing';
    order.gigsgridResponse = gigsgridOrder;
    await order.save();

    res.status(200).json({ success: true, orderId: order._id, gigsgridOrderId: gigsgridOrder.order_id });
  } catch (error) {
    console.error('❌ Confirm payment error:', error.message);
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
    // If user is logged in, ensure they own it or are admin
    if (req.user) {
      if (req.user.role !== 'admin' && order.userId && order.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Unauthorized access to this order.' });
      }
    }
    res.json(order);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order.' });
  }
};
