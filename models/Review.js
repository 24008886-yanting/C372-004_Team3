const db = require('../db');

const Review = {
  createReview(userId, productId, orderId, rating, reviewText, callback) {
    const sql = `
      INSERT INTO reviews (user_id, product_id, order_id, rating, review_text, created_at)
      VALUES (?, ?, ?, ?, ?, NOW())
    `;
    const params = [userId, productId, orderId, Number(rating) || 0, reviewText];
    db.query(sql, params, callback);
  },

  getReviewByUserAndProduct(userId, productId, orderId, callback) {
    const sql = `
      SELECT r.*, p.product_name
      FROM reviews r
      LEFT JOIN products p ON r.product_id = p.product_id
      WHERE r.user_id = ? AND r.product_id = ? AND r.order_id = ?
        AND r.rating BETWEEN 1 AND 5
        AND r.review_text IS NOT NULL
        AND TRIM(r.review_text) <> ''
      LIMIT 1
    `;
    db.query(sql, [userId, productId, orderId], (err, rows) => {
      if (err) return callback(err);
      return callback(null, rows && rows.length ? rows[0] : null);
    });
  },

  getReviewsByProduct(productId, callback) {
    const sql = `
      SELECT r.*, u.username
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.user_id
      WHERE r.product_id = ?
      ORDER BY r.created_at DESC
    `;
    db.query(sql, [productId], callback);
  },

  getReviewsByUser(userId, callback) {
    const sql = `
      SELECT r.*, p.product_name
      FROM reviews r
      LEFT JOIN products p ON r.product_id = p.product_id
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC
    `;
    db.query(sql, [userId], callback);
  },

  getAllReviews(callback) {
    const sql = `
      SELECT r.*, u.username, p.product_name
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.user_id
      LEFT JOIN products p ON r.product_id = p.product_id
      ORDER BY r.created_at DESC
    `;
    db.query(sql, callback);
  },

  deleteReview(reviewId, callback) {
    const sql = 'DELETE FROM reviews WHERE review_id = ?';
    db.query(sql, [reviewId], callback);
  }
};

module.exports = Review;
