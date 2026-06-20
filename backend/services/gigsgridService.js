/**
 * gigsgridService.js
 * ------------------------------------------------
 * Service module that encapsulates all communication with the Gigsgrid API.
 * Implements caching (10 min) and falls back to mock data if all endpoints fail.
 * The mock data reflects the actual MTN packages from your Gigsgrid dashboard.
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
   * Falls back to mock data if all endpoints fail.
   */
  async getPlans(network) {
    if (!this.apiKey) {
      console.warn('⚠️ GIGSGRID_API_KEY missing – using mock data.');
      return this.getMockPlans(network);
    }

    const cacheKey = `plans_${network}`;
    const cached = planCache.get(cacheKey);
    if (cached) return cached;

    // Try endpoints in order
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
    console.warn(`⚠️ All endpoints failed for ${network} – returning mock data.`);
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

      let plans = null;

      // Case 1: Direct array response
      if (Array.isArray(data)) {
        plans = data;
      }
      // Case 2: Data wrapped in a 'data' property
      else if (data.data && Array.isArray(data.data)) {
        plans = data.data;
      }
      // Case 3: Data wrapped in a 'plans' property
      else if (data.plans && Array.isArray(data.plans)) {
        plans = data.plans;
      }
      // Case 4: Data wrapped in a 'packages' property
      else if (data.packages && Array.isArray(data.packages)) {
        plans = data.packages;
      }

      // Validate and map the plans
      if (plans && plans.length > 0 && plans[0].name && plans[0].price !== undefined) {
        return plans.map(plan => ({
          package_size: plan.name || plan.package_size,
          price: parseFloat(plan.price) || 0,
          name: plan.name || plan.package_size,
          ...plan
        }));
      }

      console.warn(`⚠️ Endpoint ${endpoint} returned data but no valid plans:`, data);
      return null;
    } catch (error) {
      console.warn(`⚠️ Endpoint ${endpoint} failed:`, error.message);
      return null;
    }
  }

  /**
   * Mock plans – exactly matches the MTN packages from your screenshot.
   * Used when the Gigsgrid API is unavailable or returns an error.
   */
  getMockPlans(network) {
    const mockPlans = {
      mtn: [
        { package_size: '1GB', price: 3.80, name: '1GB' },
        { package_size: '2GB', price: 7.60, name: '2GB' },
        { package_size: '3GB', price: 11.40, name: '3GB' },
        { package_size: '4GB', price: 15.20, name: '4GB' },
        { package_size: '5GB', price: 19.00, name: '5GB' },
        { package_size: '6GB', price: 22.80, name: '6GB' },
        { package_size: '7GB', price: 26.60, name: '7GB' },
        { package_size: '8GB', price: 30.40, name: '8GB' },
        { package_size: '9GB', price: 34.20, name: '9GB' },
        { package_size: '10GB', price: 38.00, name: '10GB' },
        { package_size: '11GB', price: 41.80, name: '11GB' },
        { package_size: '12GB', price: 45.60, name: '12GB' },
        { package_size: '14GB', price: 53.20, name: '14GB' },
        { package_size: '15GB', price: 57.00, name: '15GB' },
        { package_size: '18GB', price: 68.40, name: '18GB' },
        { package_size: '20GB', price: 75.00, name: '20GB' },
        { package_size: '25GB', price: 94.00, name: '25GB' },
        { package_size: '30GB', price: 113.00, name: '30GB' },
        { package_size: '40GB', price: 145.00, name: '40GB' },
        { package_size: '50GB', price: 180.00, name: '50GB' },
      ],
      telecel: [
        { package_size: '1GB', price: 4.00, name: '1GB' },
        { package_size: '2GB', price: 8.00, name: '2GB' },
        { package_size: '5GB', price: 18.00, name: '5GB' },
      ],
      airtel_tigo: [
        { package_size: '1GB', price: 3.50, name: '1GB' },
        { package_size: '2GB', price: 7.00, name: '2GB' },
        { package_size: '5GB', price: 16.00, name: '5GB' },
      ],
      bigtime: [
        { package_size: '1GB', price: 3.20, name: '1GB' },
        { package_size: '2GB', price: 6.40, name: '2GB' },
        { package_size: '5GB', price: 15.00, name: '5GB' },
      ],
    };
    return mockPlans[network] || mockPlans.mtn;
  }

  /**
   * Create a new data bundle order on Gigsgrid.
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
   */
  async checkOrderStatus(orderId) {
    return this._request(`/check_order_status?order_id=${orderId}`, { method: 'GET' });
  }

  /**
   * Retrieve all pending top‑up verifications from Gigsgrid.
   */
  async getPendingVerifications() {
    return this._request('/get_pending_verifications', { method: 'GET' });
  }

  /**
   * Verify a top‑up (mark as completed) on Gigsgrid.
   */
  async verifyTopup(verificationData) {
    return this._request('/verify_topup', {
      method: 'POST',
      data: verificationData,
    });
  }
}

module.exports = new GigsgridService();
