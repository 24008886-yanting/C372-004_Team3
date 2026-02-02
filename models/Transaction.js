const db = require('../db');

const TransactionModel = {
  /**
   * Record a PayPal transaction row.
   */
  record(data, callback) {
    const sql = `
      INSERT INTO transactions
      (order_id, paypal_order_id, payer_id, payer_email, amount, currency, status, payment_method, transaction_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    const params = [
      data.order_id || null,
      data.paypal_order_id || null,
      data.payer_id || null,
      data.payer_email || null,
      Number(data.amount) || 0,
      data.currency || 'SGD',
      data.status || null,
      data.payment_method || 'UNKNOWN'
    ];

    db.query(sql, params, callback);
  }
};

module.exports = TransactionModel;
