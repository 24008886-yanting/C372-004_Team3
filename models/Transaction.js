const db = require('../db');

const TransactionModel = {
  /**
   * Record a transaction row (supports multiple payment methods).
   * payment_method: 'PayPal'
   */
  record(data, callback) {
    const sql = `
      INSERT INTO transactions
      (order_id, payment_method, paypal_order_id, payer_id, payer_email, amount, currency, status, transaction_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    // Generate numeric order_id if not provided (use timestamp as unique ID)
    const orderId = data.order_id || Math.floor(Date.now() / 1000);
    // Use paypal_order_id as the payment reference
    const paymentReference = data.paypal_order_id || `TXN-${Date.now()}`;

    const params = [
      orderId,
      data.payment_method || 'PayPal',
      paymentReference,
      data.payer_id || null,
      data.payer_email || null,
      Number(data.amount) || 0,
      data.currency || 'SGD',
      data.status || null
    ];

    db.query(sql, params, callback);
  }
};

module.exports = TransactionModel;
