const db = require('../db');

const CartModel = {
  // Fetch cart items for a user with product details
  getCartByUser(userId, callback) {
    const sql = `
      SELECT c.cart_id, c.user_id, c.product_id, c.quantity, c.added_at,
             p.product_name, p.price, p.image1, p.stock
      FROM cart c
      JOIN products p ON c.product_id = p.product_id
      WHERE c.user_id = ?
      ORDER BY c.added_at DESC
    `;
    db.query(sql, [userId], callback);
  },

  // Add a product to the cart; increments if already present
  addItem(userId, productId, quantity, callback) {
    const safeQty = Math.max(parseInt(quantity, 10) || 0, 1);

    // Ensure product exists and check stock
    const productSql = 'SELECT product_id, stock FROM products WHERE product_id = ?';
    db.query(productSql, [productId], (productErr, products) => {
      if (productErr) return callback(productErr);
      if (!products || products.length === 0) {
        return callback(new Error('Product not found'));
      }

      const product = products[0];

      // Check if item already in cart
      const cartSql = 'SELECT cart_id, quantity FROM cart WHERE user_id = ? AND product_id = ?';
      db.query(cartSql, [userId, productId], (cartErr, cartRows) => {
        if (cartErr) return callback(cartErr);

        if (cartRows && cartRows.length > 0) {
          const existing = cartRows[0];
          const newQty = existing.quantity + safeQty;
          if (newQty > product.stock) {
            return callback(new Error('Not enough stock for requested quantity'));
          }

          const updateSql = 'UPDATE cart SET quantity = ? WHERE cart_id = ?';
          return db.query(updateSql, [newQty, existing.cart_id], (updateErr, updateResult) => {
            if (updateErr) return callback(updateErr);
            callback(null, {
              action: 'updated',
              cart_id: existing.cart_id,
              quantity: newQty,
              db_result: updateResult
            });
          });
        }

        if (safeQty > product.stock) {
          return callback(new Error('Not enough stock for requested quantity'));
        }

        const insertSql = `
          INSERT INTO cart (user_id, product_id, quantity)
          VALUES (?, ?, ?)
        `;
        db.query(insertSql, [userId, productId, safeQty], (insertErr, insertResult) => {
          if (insertErr) return callback(insertErr);
          callback(null, {
            action: 'added',
            cart_id: insertResult?.insertId,
            quantity: safeQty,
            db_result: insertResult
          });
        });
      });
    });
  },

  // Update quantity for a specific cart row
  updateQuantity(cartId, userId, quantity, callback) {
    const safeQty = Math.max(parseInt(quantity, 10) || 0, 1);

    // Ensure the cart item belongs to the user and stock is sufficient
    const sql = `
      SELECT c.cart_id, c.quantity, c.product_id, p.stock
      FROM cart c
      JOIN products p ON c.product_id = p.product_id
      WHERE c.cart_id = ? AND c.user_id = ?
    `;
    db.query(sql, [cartId, userId], (err, rows) => {
      if (err) return callback(err);
      if (!rows || rows.length === 0) {
        return callback(new Error('Cart item not found'));
      }

      const item = rows[0];
      if (safeQty > item.stock) {
        return callback(new Error('Not enough stock for requested quantity'));
      }

      const updateSql = 'UPDATE cart SET quantity = ? WHERE cart_id = ?';
      db.query(updateSql, [safeQty, item.cart_id], callback);
    });
  },

  // Remove a single cart item
  removeItem(cartId, userId, callback) {
    const sql = 'DELETE FROM cart WHERE cart_id = ? AND user_id = ?';
    db.query(sql, [cartId, userId], callback);
  },

  // Clear cart for a user
  clearCart(userId, callback) {
    const sql = 'DELETE FROM cart WHERE user_id = ?';
    db.query(sql, [userId], callback);
  },

  // Perform checkout: create order + order_items, update stock, and clear cart
  checkout(userId, options, callback) {
    const { voucher_id = null, shipping_fee = 0, tax_rate = 0, discount_amount = 0 } = options || {};

    db.beginTransaction((txErr) => {
      if (txErr) return callback(txErr);

      const cartSql = `
        SELECT c.cart_id, c.product_id, c.quantity, p.price, p.stock
        FROM cart c
        JOIN products p ON c.product_id = p.product_id
        WHERE c.user_id = ?
        FOR UPDATE
      `;

      db.query(cartSql, [userId], (cartErr, cartItems) => {
        if (cartErr) return db.rollback(() => callback(cartErr));
        if (!cartItems || cartItems.length === 0) {
          return db.rollback(() => callback(new Error('Cart is empty')));
        }

        // Validate stock and calculate totals
        let subtotal = 0;
        for (const item of cartItems) {
          if (item.quantity > item.stock) {
            return db.rollback(() => callback(new Error('Not enough stock for one of the items')));
          }
          subtotal += Number(item.price) * Number(item.quantity);
        }

        const shippingFee = Number(shipping_fee) || 0;
        const discount = Number(discount_amount) || 0;
        const taxAmount = Number(((Number(tax_rate) || 0) / 100) * subtotal);
        const total = subtotal - discount + shippingFee + taxAmount;

        const orderSql = `
          INSERT INTO orders (user_id, voucher_id, subtotal, discount_amount, shipping_fee, tax_amount, total_amount)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const orderParams = [userId, voucher_id, subtotal, discount, shippingFee, taxAmount, total];

        db.query(orderSql, orderParams, (orderErr, orderResult) => {
          if (orderErr) return db.rollback(() => callback(orderErr));
          const orderId = orderResult.insertId;

          // Insert order items
          const orderItemValues = cartItems.map((item) => [
            orderId,
            item.product_id,
            item.quantity,
            item.price,
            Number(item.price) * Number(item.quantity)
          ]);

          const orderItemSql = `
            INSERT INTO order_items (order_id, product_id, quantity, price_each, item_total)
            VALUES ?
          `;
          db.query(orderItemSql, [orderItemValues], (oiErr) => {
            if (oiErr) return db.rollback(() => callback(oiErr));

            // Update product stock sequentially
            const updateStock = (index = 0) => {
              if (index >= cartItems.length) {
                // Clear the cart
                return db.query('DELETE FROM cart WHERE user_id = ?', [userId], (clearErr) => {
                  if (clearErr) return db.rollback(() => callback(clearErr));

                  db.commit((commitErr) => {
                    if (commitErr) return db.rollback(() => callback(commitErr));
                    callback(null, { order_id: orderId, subtotal, discount_amount: discount, shipping_fee: shippingFee, tax_amount: taxAmount, total_amount: total });
                  });
                });
              }

              const item = cartItems[index];
              const stockSql = 'UPDATE products SET stock = stock - ? WHERE product_id = ?';
              db.query(stockSql, [item.quantity, item.product_id], (stockErr) => {
                if (stockErr) return db.rollback(() => callback(stockErr));
                updateStock(index + 1);
              });
            };

            updateStock(0);
          });
        });
      });
    });
  }
};

module.exports = CartModel;
