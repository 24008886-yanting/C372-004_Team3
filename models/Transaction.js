const db = require('../db');

const TransactionModel = {
  /**
   * Record a transaction row (supports multiple payment methods).
   * payment_method: 'PayPal'
   */
  record(data, callback) {

    const method = (data.payment_method || '').toString().trim();
    if (!method) {
      return callback(new Error('payment_method is required'));
    }
    const sql = `
      INSERT INTO transactions
      (order_id, payment_method, paypal_order_id, payer_id, payer_email, amount, currency, status, transaction_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    // Respect nullable FK: only use provided order_id; otherwise null to avoid FK violations
    const orderId = data.order_id ?? null;
    // Use paypal_order_id as the payment reference
    const paymentReference = data.paypal_order_id || `TXN-${Date.now()}`;

    const payerId = data.payer_id ? data.payer_id.toString().slice(0, 100) : null;
    const payerEmail = data.payer_email ? data.payer_email.toString().slice(0, 255) : null;

    const params = [
      orderId,
      method.slice(0, 20),
      paymentReference,
      payerId,
      payerEmail,
      Number(data.amount) || 0,
      data.currency || 'SGD',
      data.status || null
    ];

    db.query(sql, params, callback);
  },
  getLatestByOrderId(orderId, callback) {
    if (!orderId) return callback(new Error('order_id is required'));
    const sql = `
      SELECT *
      FROM transactions
      WHERE order_id = ?
      ORDER BY transaction_time DESC
      LIMIT 1
    `;
    db.query(sql, [orderId], callback);
  },
  getOrderUserId(orderId, callback) {
    if (!orderId) return callback(new Error('order_id is required'));
    const sql = `
      SELECT user_id
      FROM orders
      WHERE order_id = ?
      LIMIT 1
    `;
    db.query(sql, [orderId], callback);
  }
};

module.exports = TransactionModel;
