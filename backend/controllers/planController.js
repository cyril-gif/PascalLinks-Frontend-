/**
 * controllers/planController.js
 * ------------------------------------------------
 * Fetches data plans for a given network and provider.
 * Applies markup to base price before sending to frontend.
 */

const datamartService = require('../services/datamartService');
const gigsgridService = require('../services/gigsgridService');

const MARKUP_PERCENTAGE = 21.05;

const applyMarkup = (basePrice) => basePrice * (1 + MARKUP_PERCENTAGE / 100);

/**
 * GET /api/plans/:network?provider=datamart|gigsgrid
 */
exports.getPlans = async (req, res) => {
  try {
    const { network } = req.params;
    const { provider } = req.query; // 'datamart' or 'gigsgrid'

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

    // Fallback: if no plans from chosen provider, try the other
    if (!plans || plans.length === 0) {
      console.warn(`⚠️ No plans from ${usedProvider}, trying fallback`);
      if (usedProvider === 'datamart') {
        plans = await gigsgridService.getPlans(network);
      } else {
        plans = await datamartService.getPlans(network);
      }
      usedProvider = (usedProvider === 'datamart') ? 'gigsgrid' : 'datamart';
    }

    if (!plans || plans.length === 0) {
      // final mock fallback
      console.warn('⚠️ All providers failed, using mock data');
      const mockPlans = datamartService.getMockPlans ? datamartService.getMockPlans(network) : [];
      plans = mockPlans;
    }

    // Apply markup
    const markedUp = plans.map(plan => ({
      ...plan,
      price: applyMarkup(plan.price),
    }));

    res.json(markedUp);
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({ error: 'Failed to fetch plans.' });
  }
};
