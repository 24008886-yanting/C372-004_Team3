const db = require('../db');

const Review = {
  create(data, cb) {
    const sql = `
      INSERT INTO reviews (user_id, order_id, order_item_id, product_id, rating, comment)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const params = [data.user_id, data.order_id, data.order_item_id, data.product_id, data.rating, data.comment || null];
    db.query(sql, params, cb);
  },

  existsForOrderItem(order_item_id, cb) {
    const sql = 'SELECT COUNT(1) AS cnt FROM reviews WHERE order_item_id = ?';
    db.query(sql, [order_item_id], (err, rows) => {
      if (err) return cb(err);
      cb(null, rows[0].cnt > 0);
    });
  },

  getByProduct(product_id, cb) {
    const sql = `
      SELECT r.*, u.username AS author
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.user_id
      WHERE r.product_id = ?
      ORDER BY r.created_at DESC
    `;
    db.query(sql, [product_id], cb);
  },

  getByUser(user_id, cb) {
    const sql = `
      SELECT r.*, p.product_name
      FROM reviews r
      LEFT JOIN products p ON r.product_id = p.product_id
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC
    `;
    db.query(sql, [user_id], cb);
  },

  // Admin: fetch all reviews with user and product info
  getAll(cb) {
    const sql = `
      SELECT r.*, u.username, u.email, p.product_name
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.user_id
      LEFT JOIN products p ON r.product_id = p.product_id
      ORDER BY r.created_at DESC
    `;
    db.query(sql, cb);
  }
};

module.exports = Review;