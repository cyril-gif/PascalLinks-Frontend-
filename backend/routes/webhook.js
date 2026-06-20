/**
 * routes/webhook.js
 * ------------------------------------------------
 * Webhook endpoint to receive callbacks from Gigsgrid.
 * Updates order status in MongoDB and logs the payload.
 * No authentication required (but we verify a secret if provided).
 */

const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// POST /api/webhook/gigsgrid
router.post('/gigsgrid', webhookController.handleGigsgridWebhook);

module.exports = router;
