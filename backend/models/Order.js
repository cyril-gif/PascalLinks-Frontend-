/**
 * models/Order.js
 * ------------------------------------------------
 * Stores all data bundle orders. Tracks the entire lifecycle
 * from initiation to delivery (or failure).
 */

const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // null for guest checkout
    },
    // Order details
    network: {
      type: String,
      enum: ['mtn', 'telecel', 'airtel_tigo', 'bigtime'],
      required: true,
    },
    package_size: {
      type: String, // e.g., "1GB", "500MB"
      required: true,
    },
    beneficiary: {
      type: String,
      required: true,
      match: [/^0[2357]\d{8}$/, 'Invalid Ghana phone number'],
    },
    // Pricing
    basePrice: {
      type: Number, // price from Gigsgrid (GHS)
      required: true,
    },
    sellingPrice: {
      type: Number, // price after markup (GHS)
      required: true,
    },
    // Payment & Gigsgrid references
    transactionRef: {
      type: String, // Paystack reference
      unique: true,
      sparse: true,
    },
    gigsgridOrderId: {
      type: String, // returned by Gigsgrid
      sparse: true,
    },
    // Status tracking
    status: {
      type: String,
      enum: [
        'pending_payment', // awaiting Paystack
        'payment_failed',  // Paystack declined
        'processing',      // payment ok, order sent to Gigsgrid
        'completed',       // delivered
        'failed',          // Gigsgrid returned an error
        'retrying',        // admin manually retrying
      ],
      default: 'pending_payment',
    },
    // Raw responses for debugging
    gigsgridResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    paystackResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    // Add to Order schema
provider: {
  type: String,
  enum: ['datamart', 'gigsgrid'],
  default: 'datamart',
},
providerOrderId: {
  type: String,
  sparse: true,
},
providerResponse: {
  type: mongoose.Schema.Types.Mixed,
  default: null,
},
    // Error messages if any
    errorMessage: {
      type: String,
      default: null,
    },
    // Webhook received flag
    webhookProcessed: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index for duplicate detection (beneficiary + createdAt)
OrderSchema.index({ beneficiary: 1, createdAt: -1 });

module.exports = mongoose.model('Order', OrderSchema);
