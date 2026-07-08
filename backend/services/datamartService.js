/**
 * datamartService.js
 * ------------------------------------------------
 * Service module for DataMartGH API.
 * Uses the official DataMart package list with correct prices.
 * Networks: YELLO (MTN), AT_PREMIUM (AirtelTigo), TELECEL
 */

const axios = require('axios');
const NodeCache = require('node-cache');

const planCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

// Network mapping: DataMartGH uses these network codes
const NETWORK_MAP = {
  mtn: 'YELLO',
  telecel: 'TELECEL',
  airtel_tigo: 'AT_PREMIUM',
  bigtime: 'YELLO',
};

// Reverse mapping
const REVERSE_NETWORK_MAP = {
  YELLO: 'mtn',
  TELECEL: 'telecel',
  AT_PREMIUM: 'airtel_tigo',
};

/**
 * DataMart's actual package list with correct prices (GHS).
 * The 'capacity' field is what you send in the API call.
 */
const DATAMART_PACKAGES = {
  mtn: [
    { package_size: '1GB', price: 4.00, name: '1GB', capacity: '1' },
    { package_size: '2GB', price: 8.00, name: '2GB', capacity: '2' },
    { package_size: '3GB', price: 12.00, name: '3GB', capacity: '3' },
    { package_size: '4GB', price: 16.00, name: '4GB', capacity: '4' },
    { package_size: '5GB', price: 20.00, name: '5GB', capacity: '5' },
    { package_size: '6GB', price: 24.00, name: '6GB', capacity: '6' },
    { package_size: '8GB', price: 32.00, name: '8GB', capacity: '8' },
    { package_size: '10GB', price: 39.00, name: '10GB', capacity: '10' },
    { package_size: '15GB', price: 57.00, name: '15GB', capacity: '15' },
    { package_size: '20GB', price: 76.50, name: '20GB', capacity: '20' },
    { package_size: '25GB', price: 96.00, name: '25GB', capacity: '25' },
    { package_size: '30GB', price: 115.00, name: '30GB', capacity: '30' },
    { package_size: '40GB', price: 157.00, name: '40GB', capacity: '40' },
    { package_size: '50GB', price: 185.00, name: '50GB', capacity: '50' },
    { package_size: '100GB', price: 407.00, name: '100GB', capacity: '100' },
  ],
  airtel_tigo: [
    { package_size: '1GB', price: 3.95, name: '1GB', capacity: '1' },
    { package_size: '2GB', price: 8.35, name: '2GB', capacity: '2' },
    { package_size: '3GB', price: 13.25, name: '3GB', capacity: '3' },
    { package_size: '4GB', price: 16.50, name: '4GB', capacity: '4' },
    { package_size: '5GB', price: 19.50, name: '5GB', capacity: '5' },
    { package_size: '6GB', price: 23.50, name: '6GB', capacity: '6' },
    { package_size: '8GB', price: 30.50, name: '8GB', capacity: '8' },
    { package_size: '10GB', price: 38.50, name: '10GB', capacity: '10' },
    { package_size: '12GB', price: 45.50, name: '12GB', capacity: '12' },
    { package_size: '15GB', price: 57.50, name: '15GB', capacity: '15' },
    { package_size: '25GB', price: 95.00, name: '25GB', capacity: '25' },
    { package_size: '30GB', price: 115.00, name: '30GB', capacity: '30' },
    { package_size: '40GB', price: 151.00, name: '40GB', capacity: '40' },
    { package_size: '50GB', price: 190.00, name: '50GB', capacity: '50' },
  ],
  telecel: [
    { package_size: '5GB', price: 19.50, name: '5GB', capacity: '5' },
    { package_size: '8GB', price: 34.64, name: '8GB', capacity: '8' },
    { package_size: '10GB', price: 36.50, name: '10GB', capacity: '10' },
    { package_size: '12GB', price: 43.70, name: '12GB', capacity: '12' },
    { package_size: '15GB', price: 52.85, name: '15GB', capacity: '15' },
    { package_size: '20GB', price: 69.80, name: '20GB', capacity: '20' },
    { package_size: '25GB', price: 86.75, name: '25GB', capacity: '25' },
    { package_size: '30GB', price: 103.70, name: '30GB', capacity: '30' },
    { package_size: '40GB', price: 137.60, name: '40GB', capacity: '40' },
    { package_size: '50GB', price: 171.50, name: '50GB', capacity: '50' },
    { package_size: '100GB', price: 341.00, name: '100GB', capacity: '100' },
  ],
  bigtime: [
    { package_size: '1GB', price: 4.00, name: '1GB', capacity: '1' },
    { package_size: '2GB', price: 8.00, name: '2GB', capacity: '2' },
    { package_size: '5GB', price: 20.00, name: '5GB', capacity: '5' },
    { package_size: '10GB', price: 39.00, name: '10GB', capacity: '10' },
  ],
};

class DataMartService {
  constructor() {
    this.baseURL = process.env.DATAMART_BASE_URL || 'https://api.datamartgh.shop/api/developer';
    this.apiKey = process.env.DATAMART_API_KEY;
    if (!this.apiKey) {
      console.warn('⚠️ DATAMART_API_KEY is not defined.');
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

    if (options.method === 'POST') {
      headers['X-Idempotency-Key'] = options.idempotencyKey || this._generateIdempotencyKey();
    }

    const config = { url, headers, ...options };

    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(`❌ DATAMART API error (${endpoint}):`);
      console.error('Status:', error.response?.status);
      console.error('Data:', JSON.stringify(error.response?.data, null, 2));
      throw new Error(`DATAMART API error: ${error.response?.data?.message || error.message}`);
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
    return this._request('/balance', { method: 'GET' });
  }

  /**
   * Purchase a data bundle.
   * POST /purchase
   */
  async purchaseData(orderData) {
    const networkPlans = DATAMART_PACKAGES[orderData.network_type] || DATAMART_PACKAGES.mtn;
    const plan = networkPlans.find(p => p.package_size === orderData.package_size);
    const capacity = plan ? plan.capacity : orderData.package_size.replace('GB', '').trim();

    // Convert phone: 0241234567 → 233241234567
    let phone = orderData.beneficiary.trim();
    if (phone.startsWith('0')) {
      phone = '233' + phone.substring(1);
    }

    const payload = {
      phoneNumber: phone,
      network: NETWORK_MAP[orderData.network_type] || orderData.network_type,
      capacity: String(capacity),
      gateway: 'wallet',
    };

    console.log('📦 DATAMART purchase payload:', JSON.stringify(payload, null, 2));

    try {
      const result = await this._request('/purchase', {
        method: 'POST',
        data: payload,
        idempotencyKey: orderData.idempotencyKey || this._generateIdempotencyKey(),
      });
      console.log('✅ DATAMART purchase response:', JSON.stringify(result, null, 2));
      return result;
    } catch (error) {
      console.error('❌ DATAMART purchase error:', error.message);
      throw error;
    }
  }

  /**
   * Bulk purchase (up to 50 orders).
   * POST /bulk-purchase
   */
  async bulkPurchase(orders) {
    const payload = orders.map(order => {
      const networkPlans = DATAMART_PACKAGES[order.network_type] || DATAMART_PACKAGES.mtn;
      const plan = networkPlans.find(p => p.package_size === order.package_size);
      const capacity = plan ? plan.capacity : order.package_size.replace('GB', '').trim();

      let phone = order.beneficiary.trim();
      if (phone.startsWith('0')) {
        phone = '233' + phone.substring(1);
      }

      return {
        phoneNumber: phone,
        network: NETWORK_MAP[order.network_type] || order.network_type,
        capacity: String(capacity),
        gateway: 'wallet',
      };
    });

    return this._request('/bulk-purchase', {
      method: 'POST',
      data: payload,
      idempotencyKey: this._generateIdempotencyKey(),
    });
  }

  /**
   * Check order status.
   * GET /order-status/:reference
   */
  async checkOrderStatus(reference) {
    return this._request(`/order-status/${reference}`, { method: 'GET' });
  }

  /**
   * Get available plans for a network.
   * Returns the DataMart package list with base prices.
   */
  async getPlans(network) {
    const cacheKey = `datamart_plans_${network}`;
    const cached = planCache.get(cacheKey);
    if (cached) return cached;

    const plans = DATAMART_PACKAGES[network] || DATAMART_PACKAGES.mtn;
    planCache.set(cacheKey, plans);
    return plans;
  }

  /**
   * Get all networks and their packages (for admin panel).
   */
  async getAllPackages() {
    return DATAMART_PACKAGES;
  }

  /**
   * Check if the service is available.
   */
  isAvailable() {
    return !!this.apiKey;
  }
}

module.exports = new DataMartService();
