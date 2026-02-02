const netsService = require('../services/Nets');

const NetsController = {
  /**
   * Generate NETS QR code for payment
   * POST /nets/generate-qr
   */
  generateQrCode: async (req, res) => {
    console.log('=== NetsController.generateQrCode called ===');
    console.log('Request body:', req.body);
    try {
      await netsService.generateQrCode(req, res);
    } catch (error) {
      console.error('NetsController error:', error);
      res.status(500).json({ error: 'Failed to generate NETS QR code: ' + error.message });
    }
  },

  /**
   * Check NETS payment status
   * POST /nets/check-payment
   */
  checkPaymentStatus: async (req, res) => {
    console.log('=== NetsController.checkPaymentStatus called ===');
    try {
      await netsService.checkPaymentStatus(req, res);
    } catch (error) {
      console.error('NetsController checkPaymentStatus error:', error);
      res.status(500).json({ error: 'Failed to check payment status: ' + error.message });
    }
  },

  /**
   * Complete NETS payment and create order
   * POST /nets/complete-payment
   */
  completePayment: async (req, res) => {
    console.log('=== NetsController.completePayment called ===');
    try {
      await netsService.completePayment(req, res);
    } catch (error) {
      console.error('NetsController completePayment error:', error);
      res.status(500).json({ error: 'Failed to complete payment: ' + error.message });
    }
  },

  /**
   * Check for completed NETS transaction
   * POST /nets/check-transaction
   */
  checkTransaction: async (req, res) => {
    console.log('=== NetsController.checkTransaction called ===');
    try {
      await netsService.checkTransaction(req, res);
    } catch (error) {
      console.error('NetsController checkTransaction error:', error);
      res.status(500).json({ error: 'Failed to check transaction: ' + error.message });
    }
  }
};

module.exports = NetsController;
