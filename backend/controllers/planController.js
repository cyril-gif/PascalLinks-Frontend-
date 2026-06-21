/**
 * controllers/planController.js
 * ------------------------------------------------
 * Fetches data plans for a given network.
 * Primary source: DataMart (via datamartService)
 * Fallback: Gigsgrid (via gigsgridService)
 * Final fallback: mock data (if all fail)
 */

const datamartService = require('../services/datamartService');
const gigsgridService = require('../services/gigsgridService');

/**
 * GET /api/plans/:network
 * @param {string} req.params.network - mtn, telecel, airtel_tigo, bigtime
 * @returns {Array} - list of plan objects (price, package_size, name, etc.)
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
        return res.json(plans);
      }
    } catch (error) {
      console.warn(`⚠️ DataMart plans failed for ${network}:`, error.message);
    }

    // 2. Fallback to Gigsgrid
    try {
      plans = await gigsgridService.getPlans(network);
      if (plans && plans.length > 0) {
        console.log(`✅ Gigsgrid plans loaded for ${network}`);
        return res.json(plans);
      }
    } catch (error) {
      console.warn(`⚠️ Gigsgrid plans failed for ${network}:`, error.message);
    }

    // 3. Final fallback – mock data (ensure we always return something)
    console.warn(`⚠️ All providers failed for ${network}, using mock data.`);
    plans = datamartService.getMockPlans ? datamartService.getMockPlans(network) : [];
    res.json(plans);
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({ error: 'Failed to fetch plans.' });
  }
};
