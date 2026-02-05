const Cart = require('./Cart');
const Voucher = require('./Voucher');
const Transaction = require('./Transaction');

const TAX_RATE_PERCENT = 9;
const SHIPPING_THRESHOLD = 60;
const SHIPPING_FEE = 5;
const CURRENCY = 'SGD';

const toTwoDp = (value) => Number((Number(value) || 0).toFixed(2));

const computeShipping = (subtotal) => {
  if (subtotal <= 0) return 0;
  return subtotal >= SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
};

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
        const taxAmount = toTwoDp(subtotal * (TAX_RATE_PERCENT / 100));
        const totalBeforeDiscount = subtotal + shippingFee + taxAmount;

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

const recordTransaction = (data) =>
  new Promise((resolve, reject) => {
    Transaction.record(
      {
        order_id: data.order_id || null,
        paypal_order_id: data.paypal_order_id || null,
        nets_transaction_id: data.nets_transaction_id || null,
        txn_retrieval_ref: data.txn_retrieval_ref || null,
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
  constants: {
    TAX_RATE_PERCENT,
    SHIPPING_THRESHOLD,
    SHIPPING_FEE,
    CURRENCY
  },
  toTwoDp
};
