/**
 * controllers/orderController.js
 * ------------------------------------------------
 * Handles order creation, confirmation, retrieval,
 * and tracking with live status sync from DataMart.
 * Uses provider‑specific markup and stores customer name.
 */

const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const gigsgridService = require('../services/gigsgridService');
const datamartService = require('../services/datamartService');
const paystackService = require('../services/paystackService');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

// Provider‑specific markups
const MARKUP_DATAMART = 22.5;
const MARKUP_GIGSGRID = 23.6842; // 3.80 → 4.70

const applyMarkup = (basePrice, provider) => {
  const percentage = provider === 'datamart' ? MARKUP_DATAMART : MARKUP_GIGSGRID;
  return basePrice * (1 + percentage / 100);
};

// Helper: map DataMart status to internal status
function mapDataMartStatus(dmStatus) {
  const map = {
    'pending': 'pending_payment',
    'waiting': 'processing',
    'processing': 'processing',
    'completed': 'completed',
    'delivered': 'completed',
    'failed': 'failed',
    'cancelled': 'failed',
    'refunded': 'failed'
  };
  return map[dmStatus?.toLowerCase()] || null;
}

// ----- POST /api/orders/initiate -----
exports.initiateOrder = async (req, res) => {
  try {
    const { network, package_size, beneficiary, customerName, provider } = req.body;

    if (!network || !package_size || !beneficiary || !customerName) {
      return res.status(400).json({ error: 'Missing required fields: network, package_size, beneficiary, customerName' });
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

    // Get plans from chosen provider
    let plans = [];
    let usedProvider = provider || 'datamart';

    if (usedProvider === 'datamart') {
      plans = await datamartService.getPlans(network);
    } else if (usedProvider === 'gigsgrid') {
      plans = await gigsgridService.getPlans(network);
    } else {
      return res.status(400).json({ error: 'Invalid provider.' });
    }

    if (!plans || plans.length === 0) {
      // fallback to other provider
      if (usedProvider === 'datamart') {
        plans = await gigsgridService.getPlans(network);
        usedProvider = 'gigsgrid';
      } else {
        plans = await datamartService.getPlans(network);
        usedProvider = 'datamart';
      }
    }

    if (!plans || plans.length === 0) {
      return res.status(500).json({ error: 'No plans available from any provider.' });
    }

    const plan = plans.find(p => p.package_size === package_size);
    if (!plan) {
      return res.status(400).json({ error: 'Invalid package size.' });
    }

    const basePrice = plan.price;
    const sellingPrice = applyMarkup(basePrice, usedProvider);

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

    // Create order with customerName
    const order = new Order({
      userId,
      network,
      package_size,
      beneficiary,
      customerName,
      basePrice,
      sellingPrice,
      provider: usedProvider,
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
  console.log('🔔 confirmPayment called with body:', req.body);

  try {
    const { reference } = req.body;

    if (!reference) {
      console.error('❌ No reference provided');
      return res.status(400).json({ error: 'No reference provided' });
    }

    console.log(`🔍 Verifying Paystack transaction: ${reference}`);

    const verification = await paystackService.verifyTransaction(reference);
    if (!verification.status || verification.data.status !== 'success') {
      console.error('❌ Paystack verification failed:', verification);
      await Transaction.findOneAndUpdate({ reference }, { status: 'failed' });
      await Order.findOneAndUpdate({ transactionRef: reference }, { status: 'payment_failed' });
      return res.status(400).json({ error: 'Payment not successful.' });
    }

    console.log('✅ Paystack verification successful');

    await Transaction.findOneAndUpdate({ reference }, { status: 'success' });

    const order = await Order.findOne({ transactionRef: reference });
    if (!order) {
      console.error(`❌ Order not found for reference: ${reference}`);
      return res.status(404).json({ error: 'Order not found.' });
    }

    console.log(`✅ Order found: ${order._id}, provider: ${order.provider}`);

    // ✅ FORCE DATAMART – ignore stored provider
    const provider = 'datamart';
    let providerResult;

    try {
      console.log(`📦 Calling DATAMART purchase for order ${order._id}`);
      console.log(`   Beneficiary: ${order.beneficiary}`);
      console.log(`   Package: ${order.package_size}`);
      console.log(`   Network: ${order.network}`);

      // Log the exact payload
      const payload = {
        beneficiary: order.beneficiary,
        package_size: order.package_size,
        network_type: order.network,
      };
      console.log('📦 DATAMART payload:', JSON.stringify(payload, null, 2));

      providerResult = await datamartService.purchaseData(payload);

      console.log('✅ DATAMART response:', JSON.stringify(providerResult, null, 2));

      const orderReference = providerResult?.data?.orderReference || 
                             providerResult?.orderReference || 
                             providerResult?.order_id;
      
      if (orderReference) {
        order.providerOrderId = orderReference;
        console.log(`✅ Saved providerOrderId: ${orderReference}`);
      } else {
        console.error('❌ No orderReference in DATAMART response');
        throw new Error('DATAMART did not return an order reference');
      }

      const dmStatus = providerResult?.data?.orderStatus || providerResult?.status;
      const mappedStatus = mapDataMartStatus(dmStatus) || 'processing';
      order.status = mappedStatus;
      order.providerResponse = providerResult;
      await order.save();

      console.log(`✅ Order ${order._id} completed successfully`);
      res.status(200).json({
        success: true,
        orderId: order._id,
        providerOrderId: order.providerOrderId,
        provider,
        status: order.status,
      });

    } catch (error) {
      console.error(`❌ DATAMART order placement failed:`, error.message);
      console.error('Full error:', error);
      
      order.status = 'failed';
      order.errorMessage = error.message;
      await order.save();
      
      res.status(500).json({ 
        error: 'Order placement failed.', 
        details: error.message 
      });
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
      return res.status(400).json({ error: 'Invalid phone format.' });
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
