/**
 * controllers/planController.js
 * ------------------------------------------------
 * Fetches data plans for a given network.
 * Applies markup to the base price before sending to frontend.
 * The markup percentage is the same as used in orderController.
 */

const datamartService = require('../services/datamartService');
const gigsgridService = require('../services/gigsgridService');

// Same markup as in orderController (21.05% gives 1GB = 4.60 when base = 3.80)
const MARKUP_PERCENTAGE = 21.05;

/**
 * Apply markup to a base price.
 * @param {number} basePrice - Price from provider (GHS)
 * @returns {number} - Selling price (GHS)
 */
const applyMarkup = (basePrice) => {
  return basePrice * (1 + MARKUP_PERCENTAGE / 100);
};

/**
 * GET /api/plans/:network
 * @param {string} req.params.network - mtn, telecel, airtel_tigo, bigtime
 * @returns {Array} - list of plan objects with marked‑up prices
 */
exports.getPlans = async (req, res) => {
  try {
    const { network } = req.params;
    const validNetworks = ['mtn', 'telecel', 'airtel_tigo', 'bigtime'];
    if (!validNetworks.includes(network)) {
      return res.status(400).json({ error: 'Invalid network.' });
    }

    let plans = [];

    // 1. Try DataMart first
    try {
      plans = await datamartService.getPlans(network);
      if (plans && plans.length > 0) {
        console.log(`✅ DataMart plans loaded for ${network}`);
        // Apply markup to each plan
        const markedUpPlans = plans.map(plan => ({
          ...plan,
          price: applyMarkup(plan.price),
        }));
        return res.json(markedUpPlans);
      }
    } catch (error) {
      console.warn(`⚠️ DataMart plans failed for ${network}:`, error.message);
    }

    // 2. Fallback to Gigsgrid
    try {
      plans = await gigsgridService.getPlans(network);
      if (plans && plans.length > 0) {
        console.log(`✅ Gigsgrid plans loaded for ${network}`);
        const markedUpPlans = plans.map(plan => ({
          ...plan,
          price: applyMarkup(plan.price),
        }));
        return res.json(markedUpPlans);
      }
    } catch (error) {
      console.warn(`⚠️ Gigsgrid plans failed for ${network}:`, error.message);
    }

    // 3. Final fallback – mock data with markup
    console.warn(`⚠️ All providers failed for ${network}, using mock data with markup.`);
    const mockPlans = datamartService.getMockPlans ? datamartService.getMockPlans(network) : [];
    const markedUpMock = mockPlans.map(plan => ({
      ...plan,
      price: applyMarkup(plan.price),
    }));
    res.json(markedUpMock);
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({ error: 'Failed to fetch plans.' });
  }
};
