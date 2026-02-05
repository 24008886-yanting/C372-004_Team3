const db = require('../db');
const Refund = require('../models/Refund');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const Payment = require('../models/Payment');
const paypalService = require('../services/paypal');

const { toTwoDp } = Payment;

const queryAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

const normalizeMethod = (method) => {
  const raw = String(method || '').toUpperCase();
  if (raw.includes('PAYPAL')) return 'PAYPAL';
  if (raw.includes('NETS')) return 'NETS';
  if (raw.includes('WALLET')) return 'WALLET';
  return 'UNKNOWN';
};

const guessPaymentMethod = (txn) => {
  if (!txn) return 'UNKNOWN';
  const rawOriginal = String(txn.payment_method || '');
  const raw = rawOriginal.toUpperCase();
  if (raw && raw !== 'UNKNOWN') return rawOriginal;
  const ref = String(txn.paypal_order_id || '').toUpperCase();
  const payer = String(txn.payer_id || '').toUpperCase();
  if (ref.startsWith('NETS-') || payer.startsWith('NETS_')) return 'NETS';
  if (ref.startsWith('WALLET-') || payer.startsWith('WALLET_')) return 'WALLET';
  return 'PAYPAL';
};

const getOrderForUser = async (orderId, userId) => {
  const rows = await queryAsync('SELECT order_id, user_id FROM orders WHERE order_id = ? LIMIT 1', [orderId]);
  if (!rows || rows.length === 0) return null;
  const order = rows[0];
  if (Number(order.user_id) !== Number(userId)) return null;
  return order;
};

const getLatestTransaction = (orderId) =>
  new Promise((resolve, reject) => {
    Transaction.getLatestByOrderId(orderId, (err, rows) => (err ? reject(err) : resolve(rows?.[0] || null)));
  });

const getLatestRefund = (orderId) =>
  new Promise((resolve, reject) => {
    Refund.getLatestByOrderId(orderId, (err, rows) => (err ? reject(err) : resolve(rows?.[0] || null)));
  });

const renderForm = (res, data) => res.render('refundRequest', data);

const RefundController = {
  async showRequestForm(req, res) {
    const userId = req.session?.user_id;
    const orderId = Number(req.query.order_id || 0);

    if (!userId || !orderId) {
      return res.redirect('/allTransactions');
    }

    try {
      const order = await getOrderForUser(orderId, userId);
      if (!order) {
        return renderForm(res, {
          orderId,
          itemName: req.query.item || '',
          quantity: req.query.quantity || '',
          amount: '',
          paymentMethod: '',
          success: undefined,
          error: 'Order not found or not yours.'
        });
      }

      const txn = await getLatestTransaction(orderId);
      const latestRefund = await getLatestRefund(orderId);

      const success = (req.flash && req.flash('success')[0]) || undefined;
      const error = (req.flash && req.flash('error')[0]) || undefined;

      const displayMethod = latestRefund?.payment_method || guessPaymentMethod(txn);
      const displayAmount = latestRefund?.amount ?? txn?.amount ?? '';
      return renderForm(res, {
        orderId,
        itemName: req.query.item || '',
        quantity: req.query.quantity || '',
        amount: displayAmount,
        paymentMethod: displayMethod,
        refundStatus: latestRefund?.status || '',
        refundReference: latestRefund?.refund_reference || '',
        success,
        error
      });
    } catch (err) {
      console.error('refundRequest form error:', err);
      return renderForm(res, {
        orderId,
        itemName: req.query.item || '',
        quantity: req.query.quantity || '',
        amount: '',
        paymentMethod: '',
        success: undefined,
        error: 'Failed to load refund request. Please try again.'
      });
    }
  },

  async submitRequest(req, res) {
    const userId = req.session?.user_id;
    const orderId = Number(req.body?.order_id || 0);
    const reason = (req.body?.reason || '').trim();
    const details = (req.body?.details || '').trim();
    const itemName = req.body?.item_name || '';
    const quantity = req.body?.quantity || '';

    if (!userId || !orderId || !reason) {
      return renderForm(res, {
        orderId,
        itemName,
        quantity,
        amount: req.body?.amount || '',
        paymentMethod: '',
        success: undefined,
        error: 'Order ID and reason are required.'
      });
    }

    try {
      const order = await getOrderForUser(orderId, userId);
      if (!order) {
        return renderForm(res, {
          orderId,
          itemName,
          quantity,
          amount: '',
          paymentMethod: '',
          success: undefined,
          error: 'Order not found or not yours.'
        });
      }

      const txn = await getLatestTransaction(orderId);
      if (!txn) {
        return renderForm(res, {
          orderId,
          itemName,
          quantity,
          amount: '',
          paymentMethod: '',
          success: undefined,
          error: 'No payment record found for this order.'
        });
      }

      const latestRefund = await getLatestRefund(orderId);
      if (latestRefund && ['PENDING', 'REFUNDED'].includes(String(latestRefund.status || '').toUpperCase())) {
        return renderForm(res, {
          orderId,
          itemName,
          quantity,
          amount: txn.amount,
          paymentMethod: guessPaymentMethod(txn),
          refundStatus: latestRefund.status,
          refundReference: latestRefund.refund_reference,
          success: undefined,
          error: 'A refund has already been submitted for this order.'
        });
      }

      const failedCountRows = await queryAsync(
        'SELECT COUNT(*) AS failed_count FROM refund_requests WHERE order_id = ? AND status = ?',
        [orderId, 'FAILED']
      );
      const failedCount = Number(failedCountRows?.[0]?.failed_count || 0);
      if (failedCount >= 3) {
        return renderForm(res, {
          orderId,
          itemName,
          quantity,
          amount: txn.amount,
          paymentMethod: guessPaymentMethod(txn),
          refundStatus: latestRefund?.status || '',
          refundReference: latestRefund?.refund_reference || '',
          success: undefined,
          error: 'Refund attempt limit reached. Please contact support.'
        });
      }

      const amount = toTwoDp(txn.amount || 0);
      const displayMethod = guessPaymentMethod(txn);

      await new Promise((resolve, reject) => {
        Refund.create(
          {
            order_id: orderId,
            user_id: userId,
            payment_method: displayMethod,
            amount,
            reason,
            details: details || null,
            status: 'PENDING',
            payment_reference: txn.paypal_order_id || null,
            refund_reference: null
          },
          (err) => (err ? reject(err) : resolve())
        );
      });

      if (req.flash) {
        req.flash('success', 'Refund request submitted. Awaiting admin approval.');
      }

      const query = `order_id=${encodeURIComponent(orderId)}&item=${encodeURIComponent(itemName)}&quantity=${encodeURIComponent(quantity)}`;
      return res.redirect(`/refund-request?${query}`);
    } catch (err) {
      console.error('refund submit error:', err);
      return renderForm(res, {
        orderId,
        itemName,
        quantity,
        amount: req.body?.amount || '',
        paymentMethod: '',
        success: undefined,
        error: err.message || 'Refund failed. Please try again.'
      });
    }
  },

  async listAll(req, res) {
    try {
      const rows = await new Promise((resolve, reject) => {
        Refund.listAll((err, data) => (err ? reject(err) : resolve(data || [])));
      });
      const success = (req.flash && req.flash('success')[0]) || undefined;
      const error = (req.flash && req.flash('error')[0]) || undefined;
      res.render('refundRequests', { refunds: rows, success, error });
    } catch (err) {
      console.error('refund list error:', err);
      res.status(500).render('refundRequests', { refunds: [], error: 'Failed to load refunds.' });
    }
  },

  async approve(req, res) {
    const refundId = Number(req.params?.id || 0);
    if (!refundId) return res.redirect('/refund-requests');

    try {
      const refund = await new Promise((resolve, reject) => {
        Refund.getById(refundId, (err, rows) => (err ? reject(err) : resolve(rows?.[0] || null)));
      });
      if (!refund) {
        if (req.flash) req.flash('error', 'Refund request not found.');
        return res.redirect('/refund-requests');
      }

      const status = String(refund.status || '').toUpperCase();
      if (status !== 'PENDING') {
        if (req.flash) req.flash('error', `Refund is already ${status || 'processed'}.`);
        return res.redirect('/refund-requests');
      }

      const alreadyRefunded = await queryAsync(
        'SELECT refund_id FROM refund_requests WHERE order_id = ? AND status = ? LIMIT 1',
        [refund.order_id, 'REFUNDED']
      );
      if (alreadyRefunded && alreadyRefunded.length > 0) {
        if (req.flash) req.flash('error', 'Refund already completed for this order.');
        return res.redirect('/refund-requests');
      }

      const txn = await getLatestTransaction(refund.order_id);
      const method = normalizeMethod(refund.payment_method || txn?.payment_method);
      const amount = toTwoDp(refund.amount || txn?.amount || 0);
      const currency = txn?.currency || 'SGD';
      let refundReference = null;
      let finalStatus = 'REFUNDED';

      if (method === 'PAYPAL') {
        const ref = refund.payment_reference || txn?.paypal_order_id;
        if (!ref) {
          finalStatus = 'FAILED';
        } else {
          const refundResult = await paypalService.refundOrder(ref, amount, currency);
          refundReference = refundResult?.id || refundResult?.refund_id || null;
          const hasError = Boolean(refundResult?.name || refundResult?.details?.length);
          if (hasError || !refundReference) {
            finalStatus = 'FAILED';
          } else if (refundResult?.status) {
            const refundStatus = String(refundResult.status).toUpperCase();
            if (refundStatus === 'COMPLETED' || refundStatus === 'PENDING') {
              finalStatus = 'REFUNDED';
            } else {
              finalStatus = 'FAILED';
            }
          }
        }
      } else if (method === 'NETS' || method === 'WALLET') {
        await Wallet.credit(
          refund.user_id,
          amount,
          {
            txnType: 'REFUND_CREDIT',
            referenceType: 'ORDER',
            referenceId: refund.order_id,
            paymentMethod: refund.payment_method || 'REFUND',
            description: `Refund for order #${refund.order_id}`
          },
          { connection: db, manageTransaction: true }
        );
        refundReference = `WALLET-${Date.now()}`;
      } else {
        finalStatus = 'FAILED';
      }

      await new Promise((resolve, reject) => {
        Refund.updateStatus(refundId, finalStatus, refundReference, (err) => (err ? reject(err) : resolve()));
      });

      if (finalStatus === 'REFUNDED') {
        const orderRows = await queryAsync('SELECT voucher_id FROM orders WHERE order_id = ? LIMIT 1', [refund.order_id]);
        const voucherId = orderRows?.[0]?.voucher_id || null;
        if (voucherId) {
          await queryAsync(
            'UPDATE vouchers SET used_count = CASE WHEN used_count > 0 THEN used_count - 1 ELSE 0 END WHERE voucher_id = ?',
            [voucherId]
          );
        }
      }

      if (req.flash) {
        req.flash(
          finalStatus === 'REFUNDED' ? 'success' : 'error',
          finalStatus === 'REFUNDED' ? 'Refund approved and processed.' : 'Refund failed to process.'
        );
      }
      return res.redirect('/refund-requests');
    } catch (err) {
      console.error('refund approve error:', err);
      if (req.flash) req.flash('error', err.message || 'Refund approval failed.');
      return res.redirect('/refund-requests');
    }
  },

  async reject(req, res) {
    const refundId = Number(req.params?.id || 0);
    if (!refundId) return res.redirect('/refund-requests');

    try {
      const refund = await new Promise((resolve, reject) => {
        Refund.getById(refundId, (err, rows) => (err ? reject(err) : resolve(rows?.[0] || null)));
      });
      if (!refund) {
        if (req.flash) req.flash('error', 'Refund request not found.');
        return res.redirect('/refund-requests');
      }
      const status = String(refund.status || '').toUpperCase();
      if (status !== 'PENDING') {
        if (req.flash) req.flash('error', `Refund is already ${status || 'processed'}.`);
        return res.redirect('/refund-requests');
      }

      await new Promise((resolve, reject) => {
        Refund.updateStatus(refundId, 'REJECTED', null, (err) => (err ? reject(err) : resolve()));
      });
      if (req.flash) req.flash('success', 'Refund request rejected.');
      return res.redirect('/refund-requests');
    } catch (err) {
      console.error('refund reject error:', err);
      if (req.flash) req.flash('error', 'Failed to reject refund.');
      return res.redirect('/refund-requests');
    }
  }
};

module.exports = RefundController;
