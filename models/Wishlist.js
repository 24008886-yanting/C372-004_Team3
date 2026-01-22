const db = require('../db');
const Cart = require('./Cart');

const WishlistModel = {
  // Get wishlist items for a user with product details
  getByUser(userId, callback) {
    const sql = `
      SELECT w.wishlist_id, w.user_id, w.product_id, w.added_at,
             p.product_name, p.price, p.image1, p.stock, p.status
      FROM wishlist w
      JOIN products p ON w.product_id = p.product_id
      WHERE w.user_id = ?
      ORDER BY w.added_at DESC
    `;
    db.query(sql, [userId], callback);
  },

  // Add product to wishlist (ignores duplicates)
  addItem(userId, productId, callback) {
    const productSql = 'SELECT product_id, status FROM products WHERE product_id = ?';
    db.query(productSql, [productId], (productErr, rows) => {
      if (productErr) return callback(productErr);
      if (!rows || rows.length === 0) return callback(new Error('Product not found'));
      if (String(rows[0].status || '').toLowerCase() === 'unavailable') {
        return callback(new Error('Product is unavailable'));
      }

      const sql = `
        INSERT INTO wishlist (user_id, product_id)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE added_at = added_at
      `;
      db.query(sql, [userId, productId], callback);
    });
  },

  // Get wishlist item by user + product
  getItemByUserAndProduct(userId, productId, callback) {
    const sql = `
      SELECT wishlist_id, product_id
      FROM wishlist
      WHERE user_id = ? AND product_id = ?
      LIMIT 1
    `;
    db.query(sql, [userId, productId], callback);
  },

  // Remove a wishlist item by wishlist_id (ensures ownership)
  removeItem(wishlistId, userId, callback) {
    const sql = 'DELETE FROM wishlist WHERE wishlist_id = ? AND user_id = ?';
    db.query(sql, [wishlistId, userId], callback);
  },

  // Remove a wishlist item by user + product
  removeItemByUserAndProduct(userId, productId, callback) {
    const sql = 'DELETE FROM wishlist WHERE user_id = ? AND product_id = ?';
    db.query(sql, [userId, productId], callback);
  },

  // Move a cart item to wishlist: insert then delete from cart
  moveFromCart(cartId, userId, callback) {
    const cartSql = `
      SELECT cart_id, product_id
      FROM cart
      WHERE cart_id = ? AND user_id = ?
    `;

    db.query(cartSql, [cartId, userId], (cartErr, rows) => {
      if (cartErr) return callback(cartErr);
      if (!rows || rows.length === 0) return callback(new Error('Cart item not found'));

      const { product_id } = rows[0];
      const statusSql = 'SELECT status FROM products WHERE product_id = ?';
      db.query(statusSql, [product_id], (statusErr, statusRows) => {
        if (statusErr) return callback(statusErr);
        const statusValue = statusRows && statusRows[0] ? String(statusRows[0].status || '').toLowerCase() : '';
        if (statusValue === 'unavailable') {
          return callback(new Error('Product is unavailable'));
        }

        const insertSql = `
          INSERT INTO wishlist (user_id, product_id)
          VALUES (?, ?)
          ON DUPLICATE KEY UPDATE added_at = added_at
        `;

        db.query(insertSql, [userId, product_id], (insertErr) => {
          if (insertErr) return callback(insertErr);

          const deleteSql = 'DELETE FROM cart WHERE cart_id = ? AND user_id = ?';
          db.query(deleteSql, [cartId, userId], callback);
        });
      });
    });
  },

  // Move a wishlist item to cart: add to cart then remove from wishlist
  moveToCart(wishlistId, userId, quantity, callback) {
    const safeQty = Math.max(parseInt(quantity, 10) || 0, 1);
    const sql = `
      SELECT wishlist_id, product_id
      FROM wishlist
      WHERE wishlist_id = ? AND user_id = ?
    `;

    db.query(sql, [wishlistId, userId], (err, rows) => {
      if (err) return callback(err);
      if (!rows || rows.length === 0) return callback(new Error('Wishlist item not found'));

      const { product_id } = rows[0];
      Cart.addItem(userId, product_id, safeQty, (addErr) => {
        if (addErr) return callback(addErr);

        const deleteSql = 'DELETE FROM wishlist WHERE wishlist_id = ? AND user_id = ?';
        db.query(deleteSql, [wishlistId, userId], callback);
      });
    });
  }
};

module.exports = WishlistModel;
