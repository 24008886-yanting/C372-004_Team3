const Cart = require('./Cart');
const Voucher = require('./Voucher');
const Transaction = require('./Transaction');
const connection = require('../db');

const TAX_RATE_PERCENT = 9;
const SHIPPING_THRESHOLD = 60;
const SHIPPING_FEE = 5;
const CURRENCY = 'SGD';

const toTwoDp = (value) => Number((Number(value) || 0).toFixed(2));

const computeShipping = (subtotal) => {
  if (subtotal <= 0) return 0;
  return subtotal >= SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
};

// Beginner note: wraps Voucher.apply in a Promise and enforces adopter-only vouchers.
const applyVoucherAsync = (voucherCode, totalBeforeDiscount, role) =>
  new Promise((resolve, reject) => {
    const cleanCode = (voucherCode || '').trim();
    if (!cleanCode) return resolve({ discount_amount: 0, voucher_id: null });

    if (role !== 'adopter') {
      return reject(new Error('Vouchers are only available to adopters.'));
    }

    Voucher.apply(cleanCode, totalBeforeDiscount, role, (err, info) => {
      if (err) return reject(err);
      resolve(info || { discount_amount: 0, voucher_id: null });
    });
  });

/**
 * Build an order quote for the current user from their cart and optional voucher.
 */
const buildQuote = (userId, role, voucherCode) =>
  new Promise((resolve, reject) => {
    Cart.getCartByUser(userId, async (cartErr, cartItems) => {
      if (cartErr) return reject(cartErr);
      if (!cartItems || cartItems.length === 0) return reject(new Error('Your cart is empty.'));

      try {
        let subtotal = 0;
        const items = [];

        for (const item of cartItems) {
          const status = String(item.status || '').toLowerCase();
          if (status === 'unavailable') {
            throw new Error('One or more items are unavailable.');
          }
          const price = Number(item.price) || 0;
          const qty = Number(item.quantity) || 0;
          const stock = Number(item.stock) || 0;
          if (qty > stock) {
            throw new Error(`Not enough stock for ${item.product_name || 'an item'}.`);
          }
          const lineSubtotal = price * qty;
          subtotal += lineSubtotal;
          items.push({
            productId: item.product_id,
            productName: item.product_name,
            quantity: qty,
            price: toTwoDp(price),
            subtotal: toTwoDp(lineSubtotal)
          });
        }

        const shippingFee = computeShipping(subtotal);
        // GST is included in item prices; compute the included portion for display/records.
        const taxAmount = toTwoDp(subtotal * (TAX_RATE_PERCENT / (100 + TAX_RATE_PERCENT)));
        const totalBeforeDiscount = subtotal + shippingFee;

        // Beginner note: apply the voucher to subtotal + shipping, then cap the discount.
        const voucherInfo = await applyVoucherAsync(voucherCode, totalBeforeDiscount, role);
        const discountAmount = Math.min(
          Math.max(Number(voucherInfo.discount_amount) || 0, 0),
          totalBeforeDiscount
        );

        const total = toTwoDp(totalBeforeDiscount - discountAmount);

        resolve({
          items,
          pricing: {
            subtotal: toTwoDp(subtotal),
            shippingFee: toTwoDp(shippingFee),
            taxRate: TAX_RATE_PERCENT,
            taxAmount,
            discountAmount: toTwoDp(discountAmount),
            total,
            currency: CURRENCY
          },
          voucherId: voucherInfo?.voucher_id || null,
          voucherCode: voucherInfo?.voucher_code || (voucherCode || '').trim() || null
        });
      } catch (err) {
        reject(err);
      }
    });
  });


const processInvoice = (userId, user, body) =>
  new Promise((resolve, reject) => {
    if (!userId) {
      const err = new Error('User not authenticated');
      err.status = 401;
      return reject(err);
    }

    Cart.getCartByUser(userId, (cartErr, cartItems) => {
      if (cartErr) {
        const err = new Error('Your cart is empty');
        err.status = 400;
        return reject(err);
      }

      if (!cartItems || cartItems.length === 0) {
        const err = new Error('Your cart is empty');
        err.status = 400;
        return reject(err);
      }

      connection.beginTransaction((transErr) => {
        if (transErr) {
          const err = new Error('Server error processing order');
          err.status = 500;
          return reject(err);
        }

        const checks = cartItems.map((item) =>
          new Promise((resolveCheck, rejectCheck) => {
            connection.query(
              'SELECT stock, product_name, price FROM products WHERE product_id = ?',
              [item.product_id],
              (err, results) => {
                if (err) {
                  const qErr = new Error(err.message || 'Database error');
                  qErr.status = 500;
                  return rejectCheck(qErr);
                }
                if (!results || results.length === 0) {
                  const nfErr = new Error(`Product ${item.product_id} not found`);
                  nfErr.status = 400;
                  return rejectCheck(nfErr);
                }

                const dbRow = results[0];
                const available = parseInt(dbRow.stock, 10) || 0;
                if (available < item.quantity) {
                  const stockErr = new Error(`Insufficient stock for ${dbRow.product_name}`);
                  stockErr.status = 400;
                  return rejectCheck(stockErr);
                }

                connection.query(
                  'UPDATE products SET stock = stock - ? WHERE product_id = ?',
                  [item.quantity, item.product_id],
                  (err2) => {
                    if (err2) {
                      const upErr = new Error(err2.message || 'Database error');
                      upErr.status = 500;
                      return rejectCheck(upErr);
                    }
                    return resolveCheck({
                      id: item.product_id,
                      productName: dbRow.product_name,
                      price: parseFloat(dbRow.price) || 0,
                      quantity: item.quantity,
                      subtotal: (parseFloat(dbRow.price) || 0) * item.quantity
                    });
                  }
                );
              }
            );
          })
        );

        Promise.all(checks)
          .then((invoiceItems) => {
            connection.commit((commitErr) => {
              if (commitErr) {
                return connection.rollback(() => {
                  const err = new Error('Server error processing order');
                  err.status = 500;
                  return reject(err);
                });
              }

              const subtotal = invoiceItems.reduce((s, it) => s + it.subtotal, 0);

              const shippingFee = parseFloat(body?.shipping_fee) || 0;
              const taxRate = parseFloat(body?.tax_rate) || 0;
              const discountAmount = parseFloat(body?.discount_amount) || 0;
              // Beginner note: store the voucher_id on the order so it can be reported/refunded later.
              const voucherId = body?.voucher_id || null;

              const taxAmount = taxRate > 0 ? (subtotal * (taxRate / (100 + taxRate))) : 0;
              const totalAmount = subtotal + shippingFee - discountAmount;

              const invoice = {
                id: `INV-${Date.now()}`,
                user: user?.username || user?.email || 'guest',
                date: new Date(),
                items: invoiceItems,
                subtotal,
                shippingFee,
                taxAmount,
                discountAmount,
                total: totalAmount
              };

              const orderSql = `
                INSERT INTO orders (user_id, subtotal, discount_amount, shipping_fee, tax_amount, total_amount, voucher_id, payment_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `;

              connection.query(
                orderSql,
                [userId, subtotal, discountAmount, shippingFee, taxAmount, totalAmount, voucherId, 'PAID'],
                (orderErr, orderResult) => {
                  if (orderErr) {
                    return connection.rollback(() => {
                      const err = new Error('Error saving order: ' + (orderErr.message || orderErr));
                      err.status = 500;
                      return reject(err);
                    });
                  }

                  const orderId = orderResult.insertId;
                  const trackingSql = `
                    INSERT INTO order_tracking (order_id, status)
                    VALUES (?, 'in_warehouse')
                    ON DUPLICATE KEY UPDATE status = status
                  `;

                  connection.query(trackingSql, [orderId], (trackingErr) => {
                    if (trackingErr) {
                      console.error('Error creating initial tracking status:', trackingErr.message || trackingErr);
                    }
                  });

                  const itemInserts = invoiceItems.map((item) => [orderId, item.id, item.quantity, item.price, item.subtotal]);
                  const itemSql = 'INSERT INTO order_items (order_id, product_id, quantity, price_each, item_total) VALUES ?';

                  connection.query(itemSql, [itemInserts], (itemErr) => {
                    if (itemErr) {
                      return connection.rollback(() => {
                        const err = new Error('Error saving order items');
                        err.status = 500;
                        return reject(err);
                      });
                    }

                    Cart.clearCart(userId, (clearErr) => {
                      if (clearErr) console.error('Error clearing cart:', clearErr);
                      return resolve(invoice);
                    });
                  });
                }
              );
            });
          })
          .catch((err2) => {
            connection.rollback(() => {
              if (!err2.status) err2.status = 400;
              return reject(err2);
            });
          });
      });
    });
  });

const recordTransaction = (data) =>
  new Promise((resolve, reject) => {
    Transaction.record(
      {
        order_id: data.order_id || null,
        paypal_order_id: data.paypal_order_id || null,
        payer_id: data.payer_id || null,
        payer_email: data.payer_email || null,
        amount: data.amount,
        currency: data.currency || CURRENCY,
        status: data.status || null,
        payment_method: data.payment_method || 'UNKNOWN'
      },
      (err) => (err ? reject(err) : resolve())
    );
  });

module.exports = {
  buildQuote,
  recordTransaction,
  processInvoice,
  constants: {
    TAX_RATE_PERCENT,
    SHIPPING_THRESHOLD,
    SHIPPING_FEE,
    CURRENCY
  },
  toTwoDp
};
