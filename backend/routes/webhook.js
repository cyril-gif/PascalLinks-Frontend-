/**
 * routes/webhook.js
 * ------------------------------------------------
 * Webhook endpoints for Gigsgrid and DATAMART.
 * No authentication required (signature verification happens inside).
 */

const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// DATAMART webhook (primary)
router.post('/datamart', webhookController.handleDataMartWebhook);

// Gigsgrid webhook (fallback)
router.post('/gigsgrid', webhookController.handleGigsgridWebhook);

module.exports = router;
