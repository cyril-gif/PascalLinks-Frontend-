/**
 * gigsgridService.js
 * ------------------------------------------------
 * Service module that encapsulates all communication with the Gigsgrid API.
 * Implements caching (10 min) and falls back to legacy endpoints if needed.
 * Uses mock data when all API endpoints fail.
 */

const axios = require('axios');
const NodeCache = require('node-cache');

const planCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

class GigsgridService {
  constructor() {
    this.baseURL = process.env.GIGSGRID_BASE_URL || 'https://gigsgrid.store/api';
    this.apiKey = process.env.GIGSGRID_API_KEY;
    this.apiSecret = process.env.GIGSGRID_API_SECRET || '';
    if (!this.apiKey) {
      console.error('❌ GIGSGRID_API_KEY is not defined.');
    }
  }

  /**
   * Private request method with authentication.
   */
  async _request(endpoint, options = {}) {
    // If endpoint already contains a query string, use it as-is
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseURL}${endpoint}`;
    const headers = {
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json',
    };
    if (this.apiSecret) {
      headers['X-API-Secret'] = this.apiSecret;
    }

    const config = {
      url,
      headers,
      ...options,
    };

    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      if (error.response) {
        console.error(`❌ Gigsgrid API error (${endpoint}):`, {
          status: error.response.status,
          data: error.response.data,
        });
        throw new Error(`Gigsgrid API error: ${error.response.data?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Fetch plans for a given network, trying multiple endpoints if needed.
   */
  async getPlans(network) {
    if (!this.apiKey) {
      console.warn('⚠️ GIGSGRID_API_KEY missing – using mock data.');
      return this.getMockPlans(network);
    }

    const cacheKey = `plans_${network}`;
    const cached = planCache.get(cacheKey);
    if (cached) return cached;

    // List of endpoints to try in order
    const endpoints = [
      `/v1/plans/${network}`,
      `/list_plans/${network}`,
      `/list_plans.php?network=${network}`,
    ];

    let plans = null;
    for (const endpoint of endpoints) {
      console.log(`🔍 Trying endpoint: ${endpoint}`);
      plans = await this.tryFetchPlans(endpoint);
      if (plans) {
        console.log(`✅ Plans fetched from ${endpoint}`);
        break;
      }
    }

    if (plans) {
      planCache.set(cacheKey, plans);
      return plans;
    }

    // All endpoints failed – use mock data
    console.warn(`⚠️ All Gigsgrid endpoints failed for ${network} – returning mock data.`);
    return this.getMockPlans(network);
  }

  /**
   * Helper to try fetching plans from a given endpoint.
   * Returns array of plans if successful, else null.
   */
  async tryFetchPlans(endpoint) {
    try {
      const data = await this._request(endpoint, { method: 'GET' });

      // Check if the response indicates an error
      if (data.status === 'error' || data.success === false) {
        console.warn(`⚠️ Endpoint ${endpoint} returned error:`, data.message);
        return null;
      }

      // Plans are often in data.data or directly in the response
      let plans = data.data || data;
      // If it's an object with a 'plans' key, extract that
      if (plans && plans.plans && Array.isArray(plans.plans)) {
        plans = plans.plans;
      }
      if (Array.isArray(plans) && plans.length > 0) {
        return plans;
      }
      return null;
    } catch (error) {
      console.warn(`⚠️ Endpoint ${endpoint} failed:`, error.message);
      return null;
    }
  }

  /**
   * Mock plans for testing when Gigsgrid is unavailable.
   */
  getMockPlans(network) {
    const mockPlans = {
      mtn: [
        { package_size: '100MB', price: 2.50, name: 'MTN 100MB' },
        { package_size: '500MB', price: 8.00, name: 'MTN 500MB' },
        { package_size: '1GB', price: 12.00, name: 'MTN 1GB' },
        { package_size: '2GB', price: 20.00, name: 'MTN 2GB' },
        { package_size: '5GB', price: 45.00, name: 'MTN 5GB' },
      ],
      telecel: [
        { package_size: '100MB', price: 2.80, name: 'Telecel 100MB' },
        { package_size: '500MB', price: 9.00, name: 'Telecel 500MB' },
        { package_size: '1GB', price: 13.00, name: 'Telecel 1GB' },
        { package_size: '2GB', price: 22.00, name: 'Telecel 2GB' },
        { package_size: '5GB', price: 48.00, name: 'Telecel 5GB' },
      ],
      airtel_tigo: [
        { package_size: '100MB', price: 2.30, name: 'AirtelTigo 100MB' },
        { package_size: '500MB', price: 7.50, name: 'AirtelTigo 500MB' },
        { package_size: '1GB', price: 11.50, name: 'AirtelTigo 1GB' },
        { package_size: '2GB', price: 19.00, name: 'AirtelTigo 2GB' },
        { package_size: '5GB', price: 42.00, name: 'AirtelTigo 5GB' },
      ],
      bigtime: [
        { package_size: '100MB', price: 2.00, name: 'Bigtime 100MB' },
        { package_size: '500MB', price: 6.50, name: 'Bigtime 500MB' },
        { package_size: '1GB', price: 10.00, name: 'Bigtime 1GB' },
        { package_size: '2GB', price: 18.00, name: 'Bigtime 2GB' },
        { package_size: '5GB', price: 40.00, name: 'Bigtime 5GB' },
      ],
    };
    return mockPlans[network] || mockPlans.mtn;
  }

  // --- Other methods (unchanged) ---

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

  async checkOrderStatus(orderId) {
    return this._request(`/check_order_status?order_id=${orderId}`, { method: 'GET' });
  }

  async getPendingVerifications() {
    return this._request('/get_pending_verifications', { method: 'GET' });
  }

  async verifyTopup(verificationData) {
    return this._request('/verify_topup', {
      method: 'POST',
      data: verificationData,
    });
  }
}

module.exports = new GigsgridService();
