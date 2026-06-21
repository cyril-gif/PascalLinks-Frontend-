/**
 * controllers/orderController.js
 * ------------------------------------------------
 * Complete version with order creation, confirmation,
 * user orders, tracking by phone / reference, and live DataMart sync.
 */

const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const gigsgridService = require('../services/gigsgridService');
const datamartService = require('../services/datamartService');
const paystackService = require('../services/paystackService');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

const MARKUP_PERCENTAGE = 21.05;

const applyMarkup = (basePrice) => basePrice * (1 + MARKUP_PERCENTAGE / 100);

// ----- Helper to map DataMart status -----
function mapDataMartStatus(dmStatus) {
  const map = {
    'pending': 'pending_payment',
    'processing': 'processing',
    'delivered': 'completed',
    'completed': 'completed',
    'failed': 'failed',
    'cancelled': 'failed'
  };
  return map[dmStatus?.toLowerCase()] || null;
}

// ----- POST /api/orders/initiate -----
exports.initiateOrder = async (req, res) => {
  try {
    const { network, package_size, beneficiary } = req.body;

    if (!network || !package_size || !beneficiary) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const phoneRegex = /^0\d{9}$/;
    if (!phoneRegex.test(beneficiary)) {
      return res.status(400).json({ error: 'Invalid phone number.' });
    }

    // Duplicate check (2 min)
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const recentOrder = await Order.findOne({
      beneficiary,
      createdAt: { $gte: twoMinutesAgo },
      status: { $in: ['pending_payment', 'processing', 'completed'] },
    });
    if (recentOrder) {
      return res.status(409).json({ error: 'Duplicate order. Please wait 2 minutes.' });
    }

    // Get plans (DataMart first, fallback Gigsgrid)
    let plans = [];
    let provider = 'datamart';
    try {
      plans = await datamartService.getPlans(network);
      if (!plans || plans.length === 0) throw new Error('No plans from DataMart');
    } catch (error) {
      console.warn('⚠️ DataMart plans failed, falling back to Gigsgrid:', error.message);
      provider = 'gigsgrid';
      plans = await gigsgridService.getPlans(network);
    }

    const plan = plans.find(p => p.package_size === package_size);
    if (!plan) {
      return res.status(400).json({ error: 'Invalid package size.' });
    }

    const basePrice = plan.price;
    const sellingPrice = applyMarkup(basePrice);

    // Optional user association
    let userId = null;
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        if (user) userId = user._id;
      }
    } catch (_) { /* guest */ }

    // Create order
    const order = new Order({
      userId,
      network,
      package_size,
      beneficiary,
      basePrice,
      sellingPrice,
      provider,
      status: 'pending_payment',
    });
    await order.save();

    // Paystack init
    const transactionRef = uuidv4();
    const amountInPesewas = Math.round(sellingPrice * 100);

    const paystackData = await paystackService.initializeTransaction({
      email: req.user?.email || 'customer@example.com',
      amount: amountInPesewas,
      reference: transactionRef,
      callback_url: `${process.env.FRONTEND_URL}/payment-callback.html`,
      metadata: { orderId: order._id.toString() },
    });

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

    res.status(201).json({
      orderId: order._id,
      transactionRef,
      amount: sellingPrice,
      paystackKey: process.env.PAYSTACK_PUBLIC_KEY,
      accessCode: paystackData.access_code,
    });
  } catch (error) {
    console.error('❌ Initiate order error:', error.message);
    res.status(500).json({ error: 'Failed to initiate order.', details: error.message });
  }
};

// ----- POST /api/orders/confirm -----
exports.confirmPayment = async (req, res) => {
  try {
    const { reference } = req.body;

    const verification = await paystackService.verifyTransaction(reference);
    if (!verification.status || verification.data.status !== 'success') {
      await Transaction.findOneAndUpdate({ reference }, { status: 'failed' });
      await Order.findOneAndUpdate({ transactionRef: reference }, { status: 'payment_failed' });
      return res.status(400).json({ error: 'Payment not successful.' });
    }

    await Transaction.findOneAndUpdate({ reference }, { status: 'success' });

    const order = await Order.findOne({ transactionRef: reference });
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const provider = order.provider || 'datamart';
    let providerResult;

    try {
      if (provider === 'datamart') {
        providerResult = await datamartService.purchaseData({
          beneficiary: order.beneficiary,
          package_size: order.package_size,
          network_type: order.network,
        });
      } else {
        providerResult = await gigsgridService.createOrder({
          beneficiary: order.beneficiary,
          package_size: order.package_size,
          network_type: order.network,
          webhook_url: `${process.env.BACKEND_URL}/api/webhook/gigsgrid`,
        });
      }

      order.providerOrderId = providerResult.order_id || providerResult.reference || 'N/A';
      order.status = 'processing';
      order.providerResponse = providerResult;
      await order.save();

      res.status(200).json({
        success: true,
        orderId: order._id,
        providerOrderId: order.providerOrderId,
        provider,
      });
    } catch (error) {
      console.error(`❌ ${provider} order placement failed:`, error.message);
      order.status = 'failed';
      order.errorMessage = error.message;
      await order.save();
      res.status(500).json({ error: 'Order placement failed.', details: error.message });
    }
  } catch (error) {
    console.error('❌ Confirm payment error:', error.message);
    res.status(500).json({ error: 'Payment confirmation failed.' });
  }
};

// ----- GET /api/orders (protected) -----
exports.getUserOrders = async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch orders.' });
  }
};

// ----- GET /api/orders/:id (public) -----
exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    // Optional DataMart sync
    if (order.provider === 'datamart' && order.providerOrderId && !['completed','failed'].includes(order.status)) {
      try {
        const dmStatus = await datamartService.checkOrderStatus(order.providerOrderId);
        if (dmStatus?.status) {
          const newStatus = mapDataMartStatus(dmStatus.status);
          if (newStatus && newStatus !== order.status) {
            order.status = newStatus;
            await order.save();
          }
        }
      } catch (_) { /* ignore */ }
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch order.' });
  }
};

// ----- GET /api/orders/by-phone (public tracking) -----
exports.getOrdersByPhone = async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });
    const cleaned = phone.trim().replace(/\s/g, '');
    if (!/^0\d{9}$/.test(cleaned)) {
      return res.status(400).json({ error: 'Invalid phone format. Use 10-digit Ghana number.' });
    }

    let orders = await Order.find({ beneficiary: cleaned }).sort({ createdAt: -1 }).limit(20);
    if (orders.length === 0) return res.status(404).json({ error: 'No orders found for this phone.' });

    // Sync DataMart status for non‑final orders
    for (const order of orders) {
      if (order.provider === 'datamart' && order.providerOrderId && !['completed','failed'].includes(order.status)) {
        try {
          const dmStatus = await datamartService.checkOrderStatus(order.providerOrderId);
          if (dmStatus?.status) {
            const newStatus = mapDataMartStatus(dmStatus.status);
            if (newStatus && newStatus !== order.status) {
              order.status = newStatus;
              await order.save();
            }
          }
        } catch (_) { /* ignore */ }
      }
    }

    // Re‑fetch to reflect updates
    orders = await Order.find({ beneficiary: cleaned }).sort({ createdAt: -1 }).limit(20);
    res.json(orders);
  } catch (error) {
    console.error('Error in by-phone:', error);
    res.status(500).json({ error: 'Failed to fetch orders.' });
  }
};

// ----- GET /api/orders/by-reference (public tracking) -----
exports.getOrdersByReference = async (req, res) => {
  try {
    const { reference } = req.query;
    if (!reference) return res.status(400).json({ error: 'Reference is required' });

    const order = await Order.findOne({ transactionRef: reference.trim() });
    if (!order) return res.status(404).json({ error: 'Order not found with this reference.' });

    if (order.provider === 'datamart' && order.providerOrderId && !['completed','failed'].includes(order.status)) {
      try {
        const dmStatus = await datamartService.checkOrderStatus(order.providerOrderId);
        if (dmStatus?.status) {
          const newStatus = mapDataMartStatus(dmStatus.status);
          if (newStatus && newStatus !== order.status) {
            order.status = newStatus;
            await order.save();
          }
        }
      } catch (_) { /* ignore */ }
    }

    res.json(order);
  } catch (error) {
    console.error('Error in by-reference:', error);
    res.status(500).json({ error: 'Failed to fetch order.' });
  }
};
