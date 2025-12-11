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
