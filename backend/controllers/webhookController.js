/**
 * controllers/webhookController.js
 * ------------------------------------------------
 * Handles incoming Gigsgrid webhooks.
 * Updates the order status and logs the webhook payload.
 * Always returns 200 to acknowledge receipt.
 */

const Order = require('../models/Order');

/**
 * POST /api/webhook/gigsgrid
 * Expected payload: { order_id, status, message?, ... }
 * We map Gigsgrid status to our internal statuses.
 */
exports.handleGigsgridWebhook = async (req, res) => {
  // Always respond immediately to prevent timeout
  res.status(200).json({ received: true });

  try {
    const payload = req.body;
    console.log('📩 Gigsgrid webhook received:', payload);

    const { order_id, status, message } = payload;

    // Find order by gigsgridOrderId
    const order = await Order.findOne({ gigsgridOrderId: order_id });
    if (!order) {
      console.error(`❌ Order with gigsgridOrderId ${order_id} not found`);
      // Still return 200, but log the error
      return;
    }

    // Map Gigsgrid status to our statuses
    let newStatus = order.status; // fallback
    if (status === 'success' || status === 'completed') {
      newStatus = 'completed';
    } else if (status === 'failed' || status === 'rejected') {
      newStatus = 'failed';
      order.errorMessage = message || 'Gigsgrid reported failure';
    } else if (status === 'pending' || status === 'processing') {
      newStatus = 'processing';
    } else {
      // Unknown status, keep existing
      newStatus = order.status;
    }

    // Update order
    order.status = newStatus;
    order.gigsgridResponse = payload; // store full webhook payload
    order.webhookProcessed = true;
    await order.save();

    console.log(`✅ Order ${order._id} updated to status: ${newStatus}`);
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    // We already sent 200, so nothing else to do.
  }
};
