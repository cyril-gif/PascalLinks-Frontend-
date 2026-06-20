/**
 * controllers/planController.js
 */
const gigsgridService = require('../services/gigsgridService');

exports.getPlans = async (req, res) => {
  try {
    const { network } = req.params;
    const validNetworks = ['mtn', 'telecel', 'airtel_tigo', 'bigtime'];
    if (!validNetworks.includes(network)) {
      return res.status(400).json({ error: 'Invalid network.' });
    }

    const plans = await gigsgridService.getPlans(network);
    res.json(plans);
  } catch (error) {
    console.error('❌ Error fetching plans:', error.message);
    // Send a detailed error to the frontend (but not the full stack)
    res.status(500).json({ 
      error: 'Failed to fetch plans from Gigsgrid.',
      details: error.message   // for debugging; remove in production if needed
    });
  }
};
