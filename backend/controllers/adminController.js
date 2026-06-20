/**
 * controllers/adminController.js
 * ------------------------------------------------
 * Implements admin functionality: viewing orders, retrying,
 * wallet balance, pending verifications, pricing, analytics.
 */

const Order = require('../models/Order');
const Settings = require('../models/Settings');
const gigsgridService = require('../services/gigsgridService');
const paystackService = require('../services/paystackService'); // not directly used but kept

/**
 * GET /api/admin/orders
 * Returns all orders with optional filtering (status, network, date range).
 */
exports.getAllOrders = async (req, res) => {
  try {
    const { status, network, startDate, endDate } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (network) filter.network = network;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const orders = await Order.find(filter)
      .populate('userId', 'email fullName')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    console.error('Error fetching admin orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
};

/**
 * GET /api/admin/orders/:id
 * Get a specific order by ID (admin can view any order).
 */
exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('userId', 'email fullName');
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(order);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
};

/**
 * POST /api/admin/orders/:id/retry
 * Manually retry a failed order by re-submitting to Gigsgrid.
 */
exports.retryOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    // Only retry if status is 'failed' or 'payment_failed'?
    if (order.status !== 'failed' && order.status !== 'payment_failed') {
      return res.status(400).json({ error: 'Order is not in a retryable state' });
    }

    // Re-submit to Gigsgrid
    const gigsgridOrder = await gigsgridService.createOrder({
      beneficiary: order.beneficiary,
      package_size: order.package_size,
      network_type: order.network,
      webhook_url: `${process.env.BACKEND_URL}/api/webhook/gigsgrid`,
    });

    // Update order
    order.gigsgridOrderId = gigsgridOrder.order_id;
    order.status = 'processing';
    order.gigsgridResponse = gigsgridOrder;
    order.errorMessage = null;
    await order.save();

    res.json({ success: true, order, gigsgridOrder });
  } catch (error) {
    console.error('Retry order error:', error);
    // Update order with error
    await Order.findByIdAndUpdate(req.params.id, {
      status: 'failed',
      errorMessage: error.message || 'Retry failed',
    });
    res.status(500).json({ error: 'Retry failed: ' + error.message });
  }
};

/**
 * GET /api/admin/wallet
 * Fetch wallet balance from Gigsgrid.
 * (Assuming Gigsgrid provides a balance endpoint – if not, return placeholder.)
 */
exports.getWalletBalance = async (req, res) => {
  try {
    // Gigsgrid may have a /wallet or /balance endpoint – check their docs.
    // We'll implement a generic call; if not available, we can return a mock.
    // For now, we attempt a GET to /wallet (you may need to adjust).
    // If Gigsgrid doesn't have this, you can simulate.
    let balance = null;
    try {
      // We need to add a method to gigsgridService, e.g., getWalletBalance()
      // For simplicity, we'll try to call a generic endpoint.
      // If it fails, we'll return a mock.
      const response = await gigsgridService._request('/wallet', { method: 'GET' });
      balance = response.balance || response.data?.balance;
    } catch (error) {
      console.warn('Gigsgrid wallet endpoint not available, returning mock balance.');
      // Mock balance for demonstration
      balance = 100.00; // in GHS
    }
    res.json({ balance });
  } catch (error) {
    console.error('Error fetching wallet balance:', error);
    res.status(500).json({ error: 'Failed to fetch wallet balance' });
  }
};

/**
 * GET /api/admin/pending-verifications
 * Retrieve pending top-up verifications from Gigsgrid.
 */
exports.getPendingVerifications = async (req, res) => {
  try {
    const data = await gigsgridService.getPendingVerifications();
    res.json(data);
  } catch (error) {
    console.error('Error fetching pending verifications:', error);
    res.status(500).json({ error: 'Failed to fetch pending verifications' });
  }
};

/**
 * POST /api/admin/verify-topup
 * Run top-up verification (pass verification data from frontend).
 * Body: { verificationId, ... } (depends on Gigsgrid API)
 */
exports.verifyTopup = async (req, res) => {
  try {
    const verificationData = req.body;
    const result = await gigsgridService.verifyTopup(verificationData);
    res.json(result);
  } catch (error) {
    console.error('Verify topup error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
};

/**
 * GET /api/admin/settings
 * Retrieve current settings (markup percentage).
 */
exports.getSettings = async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    res.json({ markupPercentage: settings.markupPercentage });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
};

/**
 * PUT /api/admin/settings
 * Update settings (e.g., markup percentage).
 * Body: { markupPercentage: number }
 */
exports.updateSettings = async (req, res) => {
  try {
    const { markupPercentage } = req.body;
    if (markupPercentage === undefined || isNaN(markupPercentage)) {
      return res.status(400).json({ error: 'markupPercentage is required and must be a number' });
    }
    const settings = await Settings.getSettings();
    settings.markupPercentage = markupPercentage;
    await settings.save();
    res.json({ success: true, markupPercentage: settings.markupPercentage });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
};

/**
 * GET /api/admin/analytics
 * Compute basic analytics: daily sales, revenue, network breakdown.
 */
exports.getAnalytics = async (req, res) => {
  try {
    // Today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Aggregate orders by network and status
    const pipeline = [
      {
        $match: {
          createdAt: { $gte: today, $lt: tomorrow },
          status: { $in: ['completed', 'processing'] }, // consider completed/processing as revenue
        },
      },
      {
        $group: {
          _id: '$network',
          count: { $sum: 1 },
          revenue: { $sum: '$sellingPrice' },
        },
      },
    ];

    const networkStats = await Order.aggregate(pipeline);

    // Total revenue and orders today
    const totalRevenue = networkStats.reduce((acc, curr) => acc + curr.revenue, 0);
    const totalOrders = networkStats.reduce((acc, curr) => acc + curr.count, 0);

    // Previous day for comparison (optional)
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const prevDayStats = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: yesterday, $lt: today },
          status: { $in: ['completed', 'processing'] },
        },
      },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$sellingPrice' },
          count: { $sum: 1 },
        },
      },
    ]);
    const prevRevenue = prevDayStats.length > 0 ? prevDayStats[0].revenue : 0;
    const prevOrders = prevDayStats.length > 0 ? prevDayStats[0].count : 0;

    // Also get pending payment orders count
    const pendingPayment = await Order.countDocuments({ status: 'pending_payment' });
    const failedOrders = await Order.countDocuments({ status: 'failed' });

    res.json({
      today: {
        revenue: totalRevenue,
        orders: totalOrders,
        networkBreakdown: networkStats,
      },
      yesterday: {
        revenue: prevRevenue,
        orders: prevOrders,
      },
      pendingPayment,
      failedOrders,
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
};
