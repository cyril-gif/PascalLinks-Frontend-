/**
 * controllers/planController.js
 * ------------------------------------------------
 * Fetches plans for a given network + provider.
 * PRIMARY: DATAMART
 * FALLBACK: Gigsgrid
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

    // Default to datamart if no provider specified
    let usedProvider = provider || 'datamart';

    // Restrict Gigsgrid to MTN only
    if (usedProvider === 'gigsgrid' && network !== 'mtn') {
      return res.status(400).json({ error: 'Gigsgrid only supports MTN network.' });
    }

    const validNetworks = ['mtn', 'telecel', 'airtel_tigo', 'bigtime'];
    if (!validNetworks.includes(network)) {
      return res.status(400).json({ error: 'Invalid network.' });
    }

    let plans = [];

    // PRIMARY: Try DATAMART first (always)
    if (usedProvider === 'datamart') {
      try {
        plans = await datamartService.getPlans(network);
        console.log(`✅ DATAMART plans loaded for ${network}`);
      } catch (error) {
        console.warn(`⚠️ DATAMART plans failed for ${network}:`, error.message);
        // FALLBACK: Try Gigsgrid if DATAMART fails
        try {
          plans = await gigsgridService.getPlans(network);
          usedProvider = 'gigsgrid';
          console.log(`✅ FALLBACK: Gigsgrid plans loaded for ${network}`);
        } catch (fallbackError) {
          console.warn(`⚠️ Gigsgrid fallback also failed:`, fallbackError.message);
        }
      }
    } else if (usedProvider === 'gigsgrid') {
      // If user explicitly requested Gigsgrid
      try {
        plans = await gigsgridService.getPlans(network);
        console.log(`✅ Gigsgrid plans loaded for ${network}`);
      } catch (error) {
        console.warn(`⚠️ Gigsgrid plans failed:`, error.message);
        // Try DATAMART as fallback
        try {
          plans = await datamartService.getPlans(network);
          usedProvider = 'datamart';
          console.log(`✅ FALLBACK: DATAMART plans loaded for ${network}`);
        } catch (fallbackError) {
          console.warn(`⚠️ DATAMART fallback also failed:`, fallbackError.message);
        }
      }
    } else {
      return res.status(400).json({ error: 'Invalid provider. Use datamart or gigsgrid.' });
    }

    // If still no plans, use mock data
    if (!plans || plans.length === 0) {
      console.warn('⚠️ All providers failed, using mock data');
      plans = datamartService.getMockPlans ? datamartService.getMockPlans(network) : [];
      usedProvider = 'datamart';
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
