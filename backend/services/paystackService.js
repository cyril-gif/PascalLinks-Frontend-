/**
 * services/paystackService.js
 * ------------------------------------------------
 * Encapsulates all Paystack API calls.
 * Uses the secret key from environment variables.
 */

const axios = require('axios');

class PaystackService {
  constructor() {
    this.secretKey = process.env.PAYSTACK_SECRET_KEY;
    this.baseURL = 'https://api.paystack.co';
    if (!this.secretKey) {
      throw new Error('PAYSTACK_SECRET_KEY is not defined in environment variables.');
    }
  }

  /**
   * Initialize a Paystack transaction.
   * @param {object} params - { email, amount (in pesewas), reference, callback_url, metadata }
   * @returns {Promise<object>} - { status, data: { reference, access_code, authorization_url } }
   */
  async initializeTransaction(params) {
    const url = `${this.baseURL}/transaction/initialize`;
    try {
      const response = await axios.post(
        url,
        {
          email: params.email,
          amount: params.amount, // already in pesewas
          reference: params.reference,
          callback_url: params.callback_url,
          metadata: params.metadata,
        },
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error('Paystack init error:', error.response?.data || error.message);
      throw new Error(`Paystack initialization failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Verify a Paystack transaction.
   * @param {string} reference - the transaction reference
   * @returns {Promise<object>} - { status, data: { status, amount, ... } }
   */
  async verifyTransaction(reference) {
    const url = `${this.baseURL}/transaction/verify/${reference}`;
    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
        },
      });
      return response.data;
    } catch (error) {
      console.error('Paystack verify error:', error.response?.data || error.message);
      throw new Error(`Paystack verification failed: ${error.response?.data?.message || error.message}`);
    }
  }
}

module.exports = new PaystackService();
