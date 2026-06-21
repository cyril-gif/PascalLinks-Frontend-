/**
 * datamartService.js
 * ------------------------------------------------
 * Service module that encapsulates all communication with the DataMartGH API.
 * Base URL: https://api.datamartgh.shop/api/developer
 * Authentication: X-API-Key header
 */

const axios = require('axios');
const NodeCache = require('node-cache');

// Cache for plans (10 minutes TTL)
const planCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

// Network mapping: DataMartGH uses different network names
const NETWORK_MAP = {
  mtn: 'YELLO',        // MTN
  telecel: 'TELECEL',  // Telecel
  airtel_tigo: 'AT_PREMIUM', // AirtelTigo
  bigtime: 'YELLO',    // Bigtime (using MTN network)
};

// Reverse mapping for display
const REVERSE_NETWORK_MAP = {
  YELLO: 'mtn',
  TELECEL: 'telecel',
  AT_PREMIUM: 'airtel_tigo',
};

class DataMartService {
  constructor() {
    this.baseURL = process.env.DATAMART_BASE_URL || 'https://api.datamartgh.shop/api/developer';
    this.apiKey = process.env.DATAMART_API_KEY;
    if (!this.apiKey) {
      console.warn('⚠️ DATAMART_API_KEY is not defined. DataMart service will not work.');
    }
  }

  /**
   * Private request method with authentication.
   */
  async _request(endpoint, options = {}) {
    if (!this.apiKey) {
      throw new Error('DATAMART_API_KEY is not configured.');
    }

    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json',
    };

    // Add idempotency key for POST requests
    if (options.method === 'POST') {
      headers['X-Idempotency-Key'] = options.idempotencyKey || this._generateIdempotencyKey();
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
      console.error(`❌ DataMart API error (${endpoint}):`, {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });
      throw new Error(`DataMart API error: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Generate a unique idempotency key for POST requests.
   */
  _generateIdempotencyKey() {
    return `pascallinks_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  /**
   * Check wallet balance.
   * GET /balance
   */
  async getBalance() {
    const data = await this._request('/balance', { method: 'GET' });
    return data;
  }

  /**
   * Purchase a data bundle.
   * POST /purchase
   * Body: { phoneNumber, network, capacity, gateway: "wallet" }
   */
  async purchaseData(orderData) {
    const payload = {
      phoneNumber: orderData.beneficiary,
      network: NETWORK_MAP[orderData.network_type] || orderData.network_type,
      capacity: orderData.package_size,
      gateway: 'wallet',
    };

    const data = await this._request('/purchase', {
      method: 'POST',
      data: payload,
      idempotencyKey: orderData.idempotencyKey || this._generateIdempotencyKey(),
    });
    return data;
  }

  /**
   * Bulk purchase (up to 50 orders).
   * POST /bulk-purchase
   */
  async bulkPurchase(orders) {
    const payload = orders.map(order => ({
      phoneNumber: order.beneficiary,
      network: NETWORK_MAP[order.network_type] || order.network_type,
      capacity: order.package_size,
      gateway: 'wallet',
    }));

    const data = await this._request('/bulk-purchase', {
      method: 'POST',
      data: payload,
      idempotencyKey: this._generateIdempotencyKey(),
    });
    return data;
  }

  /**
   * Check order status.
   * GET /order-status/:reference
   */
  async checkOrderStatus(reference) {
    const data = await this._request(`/order-status/${reference}`, { method: 'GET' });
    return data;
  }

  /**
   * Get available plans (mock data since DataMart doesn't have a list-plans endpoint).
   * We'll use the same MTN plans as before, mapped to DataMart's network names.
   */
  async getPlans(network) {
    const cacheKey = `datamart_plans_${network}`;
    const cached = planCache.get(cacheKey);
    if (cached) return cached;

    // DataMart doesn't have a plans endpoint, so we return mock data
    // that matches the actual DataMart prices (these should be verified)
    const plans = this.getMockPlans(network);
    planCache.set(cacheKey, plans);
    return plans;
  }

  /**
   * Mock plans for DataMart.
   * These prices should be verified against actual DataMart prices.
   */
  getMockPlans(network) {
    // DataMart prices (these are examples – verify with actual API)
    const mockPlans = {
      mtn: [
        { package_size: '100MB', price: 1.80, name: '100MB' },
        { package_size: '200MB', price: 3.20, name: '200MB' },
        { package_size: '500MB', price: 5.50, name: '500MB' },
        { package_size: '1GB', price: 8.00, name: '1GB' },
        { package_size: '2GB', price: 14.00, name: '2GB' },
        { package_size: '3GB', price: 20.00, name: '3GB' },
        { package_size: '5GB', price: 30.00, name: '5GB' },
        { package_size: '10GB', price: 55.00, name: '10GB' },
        { package_size: '20GB', price: 100.00, name: '20GB' },
        { package_size: '50GB', price: 220.00, name: '50GB' },
      ],
      telecel: [
        { package_size: '1GB', price: 8.50, name: '1GB' },
        { package_size: '2GB', price: 15.00, name: '2GB' },
        { package_size: '5GB', price: 32.00, name: '5GB' },
      ],
      airtel_tigo: [
        { package_size: '1GB', price: 7.50, name: '1GB' },
        { package_size: '2GB', price: 13.00, name: '2GB' },
        { package_size: '5GB', price: 28.00, name: '5GB' },
      ],
      bigtime: [
        { package_size: '1GB', price: 6.00, name: '1GB' },
        { package_size: '2GB', price: 10.00, name: '2GB' },
        { package_size: '5GB', price: 22.00, name: '5GB' },
      ],
    };
    return mockPlans[network] || mockPlans.mtn;
  }

  /**
   * Check if the service is available (API key is set).
   */
  isAvailable() {
    return !!this.apiKey;
  }
}

module.exports = new DataMartService();
