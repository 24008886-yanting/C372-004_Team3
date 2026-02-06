const db = require('../db');

// Function-based OrderItem model using callbacks and MySQL connection
const OrderItem = {
  // Fetch all order items
  getAllOrderItems(callback) {
    const sql = `
      SELECT order_item_id, order_id, product_id, quantity, price_each, item_total
      FROM order_items
    `;
    db.query(sql, callback);
  },

  // Fetch all order items belonging to a specific user (via orders)
  getByUser(userId, callback) {
    if (!userId) return callback(new Error('user_id is required'));

    const sql = `
      SELECT
        oi.order_item_id,
        oi.order_id,
        oi.product_id,
        p.product_name AS name,
        oi.quantity,
        oi.item_total AS item_total,
        t.amount AS amount,
        t.transaction_time AS transaction_time,
        o.delivery_status AS delivery_status,
        rr.refund_id AS refund_id,
        rr.status AS refund_status,
        rr.amount AS refund_amount,
        r.review_id AS review_id,
        r.rating AS review_rating,
        r.review_text AS review_text,
        r.created_at AS review_created_at
      FROM orders o
      JOIN order_items oi ON o.order_id = oi.order_id
      JOIN products p ON oi.product_id = p.product_id
      LEFT JOIN transactions t ON o.order_id = t.order_id
      LEFT JOIN reviews r ON r.user_id = o.user_id
        AND r.product_id = oi.product_id
        AND r.order_id = o.order_id
        AND r.rating BETWEEN 1 AND 5
        AND r.review_text IS NOT NULL
        AND TRIM(r.review_text) <> ''
      LEFT JOIN (
        SELECT r1.*
        FROM refund_requests r1
        JOIN (
          SELECT order_id, MAX(created_at) AS max_created
          FROM refund_requests
          GROUP BY order_id
        ) r2
        ON r1.order_id = r2.order_id AND r1.created_at = r2.max_created
      ) rr ON rr.order_id = o.order_id
      WHERE o.user_id = ?
      ORDER BY t.transaction_time DESC, o.order_id DESC, oi.order_item_id DESC
    `;

    db.query(sql, [userId], callback);
  },

  // Fetch a single order item by primary key
  getOrderItemById(orderItemId, callback) {
    const sql = `
      SELECT order_item_id, order_id, product_id, quantity, price_each, item_total
      FROM order_items
      WHERE order_item_id = ?
    `;
    db.query(sql, [orderItemId], callback);
  },

  // Create a new order item
  addOrderItem(orderItemData, callback) {
    const { order_id, product_id, quantity, price_each, item_total } = orderItemData;
    const sql = `
      INSERT INTO order_items (order_id, product_id, quantity, price_each, item_total)
      VALUES (?, ?, ?, ?, ?)
    `;
    const params = [order_id, product_id, quantity, price_each, item_total];
    db.query(sql, params, callback);
  },

  // Update an existing order item by ID
  updateOrderItem(orderItemId, updates, callback) {
    const fields = [];
    const params = [];

    if (updates.order_id !== undefined) {
      fields.push('order_id = ?');
      params.push(updates.order_id);
    }
    if (updates.product_id !== undefined) {
      fields.push('product_id = ?');
      params.push(updates.product_id);
    }
    if (updates.quantity !== undefined) {
      fields.push('quantity = ?');
      params.push(updates.quantity);
    }
    if (updates.price_each !== undefined) {
      fields.push('price_each = ?');
      params.push(updates.price_each);
    }
    if (updates.item_total !== undefined) {
      fields.push('item_total = ?');
      params.push(updates.item_total);
    }

    if (!fields.length) {
      return callback(new Error('No fields to update'));
    }

    const sql = `UPDATE order_items SET ${fields.join(', ')} WHERE order_item_id = ?`;
    params.push(orderItemId);
    db.query(sql, params, callback);
  },

  // Delete an order item by primary key
  deleteOrderItem(orderItemId, callback) {
    const sql = 'DELETE FROM order_items WHERE order_item_id = ?';
    db.query(sql, [orderItemId], callback);
  }
};

module.exports = OrderItem;
