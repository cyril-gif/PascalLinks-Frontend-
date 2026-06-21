/**
 * controllers/planController.js
 * ------------------------------------------------
 * Fetches plans for a given network + provider.
 * Applies provider‑specific markup to base prices.
 * Restricts Gigsgrid to MTN only.
 */

const datamartService = require('../services/datamartService');
const gigsgridService = require('../services/gigsgridService');

// Different markups per provider
const MARKUP_DATAMART = 22.5;   // 22.5% → 1GB = 4.90
const MARKUP_GIGSGRID = 23.6842; // 3.80 → 4.70

/**
 * Apply markup based on provider.
 */
const applyMarkup = (basePrice, provider) => {
  const percentage = provider === 'datamart' ? MARKUP_DATAMART : MARKUP_GIGSGRID;
  return basePrice * (1 + percentage / 100);
};

/**
 * GET /api/plans/:network?provider=datamart|gigsgrid
 */
exports.getPlans = async (req, res) => {
  try {
    const { network } = req.params;
    const { provider } = req.query;

    // Restrict Gigsgrid to MTN only
    if (provider === 'gigsgrid' && network !== 'mtn') {
      return res.status(400).json({ error: 'Gigsgrid only supports MTN network.' });
    }

    const validNetworks = ['mtn', 'telecel', 'airtel_tigo', 'bigtime'];
    if (!validNetworks.includes(network)) {
      return res.status(400).json({ error: 'Invalid network.' });
    }

    let plans = [];
    let usedProvider = provider || 'datamart';

    if (usedProvider === 'datamart') {
      plans = await datamartService.getPlans(network);
    } else if (usedProvider === 'gigsgrid') {
      plans = await gigsgridService.getPlans(network);
    } else {
      return res.status(400).json({ error: 'Invalid provider. Use datamart or gigsgrid.' });
    }

    // Fallback if no plans from chosen provider
    if (!plans || plans.length === 0) {
      console.warn(`⚠️ No plans from ${usedProvider}, trying fallback`);
      if (usedProvider === 'datamart') {
        plans = await gigsgridService.getPlans(network);
        usedProvider = 'gigsgrid';
      } else {
        plans = await datamartService.getPlans(network);
        usedProvider = 'datamart';
      }
    }

    if (!plans || plans.length === 0) {
      console.warn('⚠️ All providers failed, using mock data');
      plans = datamartService.getMockPlans ? datamartService.getMockPlans(network) : [];
      usedProvider = 'datamart'; // fallback to DataMart mock
    }

    // Apply provider‑specific markup
    const markedUp = plans.map(plan => ({
      ...plan,
      price: applyMarkup(plan.price, usedProvider),
    }));

    res.json(markedUp);
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({ error: 'Failed to fetch plans.' });
  }
};
