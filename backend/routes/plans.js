/**
 * routes/plans.js
 * ------------------------------------------------
 * Route to fetch data plans for a given network.
 * The controller handles caching and response formatting.
 */

const express = require('express');
const router = express.Router();
const planController = require('../controllers/planController');

// GET /api/plans/:network
router.get('/:network', planController.getPlans);

module.exports = router;
