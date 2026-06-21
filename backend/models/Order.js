/**
 * models/Order.js
 * ------------------------------------------------
 * Defines the Order schema with customer name,
 * provider details, pricing, and status.
 */

const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
    },
    network: {
      type: String,
      enum: ['mtn', 'telecel', 'airtel_tigo', 'bigtime'],
      required: true,
    },
    package_size: {
      type: String,
      required: true,
    },
    beneficiary: {
      type: String,
      required: true,
      match: [/^0\d{9}$/, 'Invalid Ghana phone number'],
    },
    basePrice: {
      type: Number,
      required: true,
    },
    sellingPrice: {
      type: Number,
      required: true,
    },
    transactionRef: {
      type: String,
      unique: true,
      sparse: true,
    },
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
    status: {
      type: String,
      enum: [
        'pending_payment',
        'payment_failed',
        'processing',
        'completed',
        'failed',
        'retrying',
      ],
      default: 'pending_payment',
    },
    errorMessage: {
      type: String,
      default: null,
    },
    webhookProcessed: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index for duplicate detection
OrderSchema.index({ beneficiary: 1, createdAt: -1 });

module.exports = mongoose.model('Order', OrderSchema);
