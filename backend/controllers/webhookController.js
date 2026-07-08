/**
 * controllers/webhookController.js
 * ------------------------------------------------
 * Handles incoming webhooks from Gigsgrid and DATAMART.
 * Updates order status and logs the webhook payload.
 * Always returns 200 to acknowledge receipt.
 */

const Order = require('../models/Order');
const crypto = require('crypto');

/**
 * Verify DATAMART webhook signature
 */
function verifyDataMartSignature(payload, signature, secret) {
  if (!secret) {
    console.warn('⚠️ DATAMART_WEBHOOK_SECRET not configured, skipping signature verification');
    return true;
  }
  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  return signature === expected;
}

/**
 * Map DATAMART status to internal status
 */
function mapDataMartStatus(dmStatus) {
  const map = {
    'created': 'pending_payment',
    'processing': 'processing',
    'completed': 'completed',
    'failed': 'failed',
    'refunded': 'failed',
  };
  return map[dmStatus?.toLowerCase()] || null;
}

/**
 * POST /api/webhook/datamart
 * Handles DATAMART webhooks
 */
exports.handleDataMartWebhook = async (req, res) => {
  // Always respond immediately
  res.status(200).json({ received: true });

  try {
    const payload = req.body;
    const signature = req.headers['x-datamart-signature'];
    const event = req.headers['x-datamart-event'] || payload.event;

    console.log('📩 DATAMART webhook received:');
    console.log('Event:', event);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    // Verify signature (optional but recommended)
    const secret = process.env.DATAMART_WEBHOOK_SECRET;
    if (secret && !verifyDataMartSignature(payload, signature, secret)) {
      console.error('❌ Invalid DATAMART webhook signature');
      return;
    }

    // Extract data
    const data = payload.data || payload;
    const orderReference = data.orderReference || data.reference;
    const status = data.status || data.orderStatus;

    if (!orderReference) {
      console.error('❌ No order reference in DATAMART webhook');
      return;
    }

    // Find order by providerOrderId
    const order = await Order.findOne({ providerOrderId: orderReference });
    if (!order) {
      console.error(`❌ Order with providerOrderId ${orderReference} not found`);
      return;
    }

    // Map status
    const newStatus = mapDataMartStatus(status);
    if (newStatus && newStatus !== order.status) {
      order.status = newStatus;
      order.providerResponse = payload;
      order.webhookProcessed = true;
      await order.save();
      console.log(`✅ Order ${order._id} updated to status: ${newStatus} (via DATAMART webhook)`);
    } else {
      console.log(`ℹ️ Order ${order._id} status unchanged (${order.status})`);
    }
  } catch (error) {
    console.error('❌ Error processing DATAMART webhook:', error);
  }
};

/**
 * POST /api/webhook/gigsgrid
 * Handles Gigsgrid webhooks
 */
exports.handleGigsgridWebhook = async (req, res) => {
  // Always respond immediately
  res.status(200).json({ received: true });

  try {
    const payload = req.body;
    console.log('📩 Gigsgrid webhook received:', payload);

    const { order_id, status, message } = payload;

    const order = await Order.findOne({ providerOrderId: order_id });
    if (!order) {
      console.error(`❌ Order with providerOrderId ${order_id} not found`);
      return;
    }

    // Map Gigsgrid status
    let newStatus = order.status;
    if (status === 'success' || status === 'completed') {
      newStatus = 'completed';
    } else if (status === 'failed' || status === 'rejected') {
      newStatus = 'failed';
      order.errorMessage = message || 'Gigsgrid reported failure';
    } else if (status === 'pending' || status === 'processing') {
      newStatus = 'processing';
    }

    if (newStatus !== order.status) {
      order.status = newStatus;
      order.providerResponse = payload;
      order.webhookProcessed = true;
      await order.save();
      console.log(`✅ Order ${order._id} updated to status: ${newStatus} (via Gigsgrid webhook)`);
    }
  } catch (error) {
    console.error('❌ Error processing Gigsgrid webhook:', error);
  }
};
