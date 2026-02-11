const db = require('../db');

const Refund = {
  // Beginner note: create() inserts a new refund request row in refund_requests (status defaults to PENDING).
  create(data, callback) {
    const sql = `
      INSERT INTO refund_requests
      (order_id, user_id, order_item_id, refund_qty, payment_method, amount, reason, details, refund_items, status, payment_reference, refund_reference, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;
    const params = [
      data.order_id,
      data.user_id,
      data.order_item_id || null,
      data.refund_qty || null,
      data.payment_method || null,
      Number(data.amount) || 0,
      data.reason || null,
      data.details || null,
      data.refund_items || null,
      data.status || 'PENDING',
      data.payment_reference || null,
      data.refund_reference || null
    ];
    db.query(sql, params, callback);
  },

  getLatestByOrderId(orderId, callback) {
    const sql = `
      SELECT *
      FROM refund_requests
      WHERE order_id = ?
      ORDER BY created_at DESC, refund_id DESC
      LIMIT 1
    `;
    db.query(sql, [orderId], callback);
  },

  getById(refundId, callback) {
    const sql = `
      SELECT *
      FROM refund_requests
      WHERE refund_id = ?
      LIMIT 1
    `;
    db.query(sql, [refundId], callback);
  },

  listByUser(userId, callback) {
    const sql = `
      SELECT *
      FROM refund_requests
      WHERE user_id = ?
      ORDER BY created_at DESC
    `;
    db.query(sql, [userId], callback);
  },

  listAll(callback) {
    const sql = `
      SELECT r.*, u.username, u.email
      FROM refund_requests r
      LEFT JOIN users u ON r.user_id = u.user_id
      ORDER BY r.created_at DESC
    `;
    db.query(sql, callback);
  },

  // Beginner note: updateStatus() changes the refund status and sets approved_at when approved/refunded.
  updateStatus(refundId, status, refundReference, callback) {
    const normalized = String(status || '').toUpperCase();
    const shouldApprove = ['APPROVED', 'REFUNDED'].includes(normalized);
    const sql = `
      UPDATE refund_requests
      SET
        status = ?,
        refund_reference = ?,
        approved_at = CASE
          WHEN ? THEN COALESCE(approved_at, NOW())
          ELSE approved_at
        END,
        updated_at = NOW()
      WHERE refund_id = ?
    `;
    db.query(sql, [normalized, refundReference || null, shouldApprove ? 1 : 0, refundId], callback);
  }
};

module.exports = Refund;
