/**
 * gigsgridService.js
 * ------------------------------------------------
 * Service module that encapsulates all communication with the Gigsgrid API.
 * All calls are made server‑side; the API key is loaded from environment variables.
 * Implements caching for plan lists (10 minutes TTL) to reduce API load.
 */

const axios = require('axios');
const NodeCache = require('node-cache'); // npm install node-cache

// In‑memory cache with 10 minutes TTL
const planCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

class GigsgridService {
  constructor() {
    this.baseURL = process.env.GIGSGRID_BASE_URL || 'https://gigsgrid.store/api';
    this.apiKey = process.env.GIGSGRID_API_KEY;
    if (!this.apiKey) {
      throw new Error('GIGSGRID_API_KEY is not defined in environment variables.');
    }
  }

  /**
   * Private helper to make authenticated requests to Gigsgrid.
   * @param {string} endpoint - API endpoint (e.g., '/v1/plans/mtn')
   * @param {object} options - axios options (method, data, etc.)
   * @returns {Promise} - axios response
   */
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
      // Log the error and re-throw with a friendly message
      console.error(`Gigsgrid API error (${endpoint}):`, error.response?.data || error.message);
      throw new Error(`Gigsgrid API request failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Fetch available data plans for a given network.
   * Uses cache: returns cached data if fresh, otherwise calls the API.
   * @param {string} network - 'mtn', 'telecel', 'airtel_tigo', or 'bigtime'
   * @returns {Promise<Array>} - list of plan objects
   */
  async getPlans(network) {
    const cacheKey = `plans_${network}`;
    const cached = planCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const data = await this._request(`/v1/plans/${network}`, { method: 'GET' });
    // Assuming the API returns an array of plans under a 'data' key or directly.
    // Adjust based on actual response structure.
    const plans = data.data || data;
    planCache.set(cacheKey, plans);
    return plans;
  }

  /**
   * Create a new data bundle order on Gigsgrid.
   * @param {object} orderData - { beneficiary, package_size, network_type, webhook_url? }
   * @returns {Promise<object>} - { order_id, status, message }
   */
  async createOrder(orderData) {
    const payload = {
      beneficiary: orderData.beneficiary,
      package_size: orderData.package_size,
      network_type: orderData.network_type,
      webhook_url: orderData.webhook_url || process.env.GIGSGRID_WEBHOOK_URL,
    };
    const data = await this._request('/create_order', {
      method: 'POST',
      data: payload,
    });
    return data;
  }

  /**
   * Check the status of an order on Gigsgrid.
   * @param {string} orderId - the Gigsgrid order ID
   * @returns {Promise<object>} - status information
   */
  async checkOrderStatus(orderId) {
    const data = await this._request(`/check_order_status?order_id=${orderId}`, {
      method: 'GET',
    });
    return data;
  }

  /**
   * Retrieve all pending top‑up verifications from Gigsgrid.
   * @returns {Promise<Array>} - list of pending verifications
   */
  async getPendingVerifications() {
    const data = await this._request('/get_pending_verifications', { method: 'GET' });
    return data;
  }

  /**
   * Verify a top‑up (mark as completed) on Gigsgrid.
   * @param {object} verificationData - payload expected by the API
   * @returns {Promise<object>} - verification result
   */
  async verifyTopup(verificationData) {
    const data = await this._request('/verify_topup', {
      method: 'POST',
      data: verificationData,
    });
    return data;
  }
}

module.exports = new GigsgridService();
