/**
 * models/Transaction.js
 * ------------------------------------------------
 * Tracks all Paystack payment transactions.
 * Linked to an Order via orderId.
 */

const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    reference: {
      type: String,
      required: true,
      unique: true,
    },
    amount: {
      type: Number,
      required: true, // in GHS
    },
    status: {
      type: String,
      enum: ['pending', 'success', 'failed'],
      default: 'pending',
    },
    paystackReference: {
      type: String, // the reference returned by Paystack
      sparse: true,
    },
    accessCode: {
      type: String,
      sparse: true,
    },
    // Store full Paystack verification response for audit
    verificationResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Transaction', TransactionSchema);
