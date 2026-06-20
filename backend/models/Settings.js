/**
 * models/Settings.js
 * ------------------------------------------------
 * Stores application settings that can be updated by the admin.
 * Currently manages markup percentage; expandable for future.
 * Only one document exists (singleton pattern).
 */

const mongoose = require('mongoose');

const SettingsSchema = new mongoose.Schema(
  {
    markupPercentage: {
      type: Number,
      default: 10, // 10% markup
      min: 0,
      max: 100,
    },
    // Future settings: minimum order amount, etc.
  },
  {
    timestamps: true,
  }
);

// Ensure only one settings document exists
SettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

module.exports = mongoose.model('Settings', SettingsSchema);
