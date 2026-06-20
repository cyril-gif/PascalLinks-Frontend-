/**
 * controllers/planController.js
 * ------------------------------------------------
 * Fetches data plans from Gigsgrid API (via gigsgridService)
 * and returns them to the frontend.
 * Implements caching via the service layer.
 */

const gigsgridService = require('../services/gigsgridService');

/**
 * GET /api/plans/:network
 * @param {string} req.params.network - mtn, telecel, airtel_tigo, bigtime
 * @returns {Array} - list of plan objects (price, package_size, etc.)
 */
exports.getPlans = async (req, res) => {
  try {
    const { network } = req.params;
    // Validate network
    const validNetworks = ['mtn', 'telecel', 'airtel_tigo', 'bigtime'];
    if (!validNetworks.includes(network)) {
      return res.status(400).json({ error: 'Invalid network. Must be one of: ' + validNetworks.join(', ') });
    }

    // Fetch plans (cached by the service)
    const plans = await gigsgridService.getPlans(network);
    res.json(plans);
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({ error: 'Failed to fetch plans. Please try again later.' });
  }
};
