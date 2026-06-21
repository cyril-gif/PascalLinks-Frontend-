/**
 * controllers/orderController.js
 * ------------------------------------------------
 * Handles order creation, payment confirmation, and retrieval.
 * Integrates with DataMart (primary) and Gigsgrid (fallback).
 * Performs duplicate check (same beneficiary within 2 minutes).
 */

const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const gigsgridService = require('../services/gigsgridService');
const datamartService = require('../services/datamartService');
const paystackService = require('../services/paystackService');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

// Markup percentage – adjust as needed (21.05% gives 1GB = 4.60 when base is 3.80)
const MARKUP_PERCENTAGE = 21.05;

/**
 * Apply markup to base price.
 * @param {number} basePrice - Price from provider (GHS)
 * @returns {number} - Selling price (GHS)
 */
const applyMarkup = (basePrice) => {
  return basePrice * (1 + MARKUP_PERCENTAGE / 100);
};

/**
 * POST /api/orders/initiate
 * Body: { network, package_size, beneficiary }
 */
exports.initiateOrder = async (req, res) => {
  try {
    const { network, package_size, beneficiary } = req.body;

    // --- Validation ---
    if (!network || !package_size || !beneficiary) {
      return res.status(400).json({ error: 'Missing required fields: network, package_size, beneficiary' });
    }

    const phoneRegex = /^0[2357]\d{8}$/;
    if (!phoneRegex.test(beneficiary)) {
      return res.status(400).json({ error: 'Invalid phone number. Use Ghana format (e.g., 024XXXXXXX)' });
    }

    // --- Duplicate check (2 minutes) ---
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

    // --- Get plans (try DataMart first, fallback to Gigsgrid) ---
    let plans = [];
    let provider = 'datamart';
    try {
      plans = await datamartService.getPlans(network);
      if (!plans || plans.length === 0) {
        throw new Error('No plans from DataMart');
      }
      console.log('📦 Using DataMart plans for', network);
    } catch (error) {
      console.warn('⚠️ DataMart plans failed, falling back to Gigsgrid:', error.message);
      provider = 'gigsgrid';
      plans = await gigsgridService.getPlans(network);
    }

    const plan = plans.find(p => p.package_size === package_size);
    if (!plan) {
      return res.status(400).json({ error: 'Invalid package size for the selected network.' });
    }

    const basePrice = plan.price;
    const sellingPrice = applyMarkup(basePrice);

    // --- Try to associate with logged-in user (optional) ---
    let userId = null;
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        if (user) userId = user._id;
      }
    } catch (error) {
      // Silent – allow guest checkout
    }

    // --- Create order ---
    const order = new Order({
      userId,
      network,
      package_size,
      beneficiary,
      basePrice,
      sellingPrice,
      provider,          // 'datamart' or 'gigsgrid'
      status: 'pending_payment',
    });
    await order.save();

    // --- Initiate Paystack ---
    const transactionRef = uuidv4();
    const amountInPesewas = Math.round(sellingPrice * 100);

    const paystackData = await paystackService.initializeTransaction({
      email: req.user?.email || 'customer@example.com',
      amount: amountInPesewas,
      reference: transactionRef,
      callback_url: `${process.env.FRONTEND_URL}/payment-callback.html`,
      metadata: {
        orderId: order._id.toString(),
      },
    });

    // Save transaction
    const transaction = new Transaction({
      orderId: order._id,
      reference: transactionRef,
      amount: sellingPrice,
      status: 'pending',
      paystackReference: paystackData.reference,
      accessCode: paystackData.access_code,
    });
    await transaction.save();

    order.transactionRef = transactionRef;
    await order.save();

    // --- Return to frontend ---
    res.status(201).json({
      orderId: order._id,
      transactionRef,
      amount: sellingPrice,
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
 * Body: { reference }
 */
exports.confirmPayment = async (req, res) => {
  try {
    const { reference } = req.body;

    // --- Verify with Paystack ---
    const verification = await paystackService.verifyTransaction(reference);
    if (!verification.status || verification.data.status !== 'success') {
      await Transaction.findOneAndUpdate({ reference }, { status: 'failed' });
      await Order.findOneAndUpdate({ transactionRef: reference }, { status: 'payment_failed' });
      return res.status(400).json({ error: 'Payment not successful.' });
    }

    await Transaction.findOneAndUpdate({ reference }, { status: 'success' });

    // --- Find the order ---
    const order = await Order.findOne({ transactionRef: reference });
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    // --- Place order with the selected provider ---
    const provider = order.provider || 'datamart';
    let providerResult;

    try {
      if (provider === 'datamart') {
        providerResult = await datamartService.purchaseData({
          beneficiary: order.beneficiary,
          package_size: order.package_size,
          network_type: order.network,
        });
        console.log('✅ DataMart order placed:', providerResult);
      } else {
        // Fallback to Gigsgrid
        providerResult = await gigsgridService.createOrder({
          beneficiary: order.beneficiary,
          package_size: order.package_size,
          network_type: order.network,
          webhook_url: `${process.env.BACKEND_URL}/api/webhook/gigsgrid`,
        });
        console.log('✅ Gigsgrid order placed:', providerResult);
      }

      // Update order with provider response
      order.providerOrderId = providerResult.order_id || providerResult.reference || 'N/A';
      order.status = 'processing';
      order.providerResponse = providerResult;
      await order.save();

      res.status(200).json({
        success: true,
        orderId: order._id,
        providerOrderId: order.providerOrderId,
        provider: provider,
      });
    } catch (error) {
      console.error(`❌ ${provider} order placement failed:`, error.message);
      order.status = 'failed';
      order.errorMessage = error.message;
      await order.save();
      res.status(500).json({
        error: `Order placement failed. Please contact support.`,
        details: error.message,
      });
    }
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
