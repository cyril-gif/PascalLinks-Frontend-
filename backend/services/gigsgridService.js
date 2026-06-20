/**
 * gigsgridService.js
 * ------------------------------------------------
 * Service module that encapsulates all communication with the Gigsgrid API.
 * All calls are made server‑side; the API key is loaded from environment variables.
 * Implements caching for plan lists (10 minutes TTL) to reduce API load.
 */

const axios = require('axios');
const NodeCache = require('node-cache');

const planCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

class GigsgridService {
  constructor() {
    this.baseURL = process.env.GIGSGRID_BASE_URL || 'https://gigsgrid.store/api';
    this.apiKey = process.env.GIGSGRID_API_KEY;
    if (!this.apiKey) {
      console.error('❌ GIGSGRID_API_KEY is not defined in environment variables.');
    }
  }

  async _request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      url,
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
      ...options,
    };
    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      // Log full error details
      console.error(`❌ Gigsgrid API error (${endpoint}):`);
      console.error('Status:', error.response?.status);
      console.error('Data:', error.response?.data);
      console.error('Message:', error.message);
      // Throw a detailed error message
      throw new Error(`Gigsgrid API error: ${error.response?.data?.message || error.message}`);
    }
  }

  async getPlans(network) {
    if (!this.apiKey) {
      throw new Error('GIGSGRID_API_KEY is not configured on the server.');
    }
    const cacheKey = `plans_${network}`;
    const cached = planCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Use the endpoint that works: /v1/plans/{network}
    const data = await this._request(`/v1/plans/${network}`, { method: 'GET' });
    const plans = data.data || data;
    planCache.set(cacheKey, plans);
    return plans;
  }

  // ... rest of methods (createOrder, etc.)
}

module.exports = new GigsgridService();
