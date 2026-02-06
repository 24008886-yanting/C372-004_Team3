const db = require('../db');
const Refund = require('../models/Refund');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const RiskFlag = require('../models/RiskFlag');
const Payment = require('../models/Payment');
const paypalService = require('../services/paypal');

const { toTwoDp } = Payment;

const queryAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

const normalizeMethod = (method) => {
  const rawOriginal = String(method || '').trim();
  const raw = rawOriginal.toUpperCase();
  if (raw === '1') return 'PAYPAL';
  if (raw === '3') return 'WALLET';
  if (raw.includes('PAYPAL')) return 'PAYPAL';
  if (raw.includes('NETS')) return 'NETS';
  if (raw.includes('WALLET') || raw.includes('DIGITAL')) return 'WALLET';
  return 'UNKNOWN';
};

const guessPaymentMethod = (txn) => {
  if (!txn) return 'UNKNOWN';
  const rawOriginal = String(txn.payment_method || '').trim();
  const normalized = normalizeMethod(rawOriginal);
  if (normalized !== 'UNKNOWN') return normalized;
  const ref = String(txn.paypal_order_id || '').toUpperCase();
  const payer = String(txn.payer_id || '').toUpperCase();
  if (normalized === 'NETS') return 'NETS';
  if (ref.startsWith('NETS') || ref.includes('NETS') || payer.startsWith('NETS_')) return 'NETS';
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

const getOrderUserId = (orderId) =>
  new Promise((resolve, reject) => {
    Transaction.getOrderUserId(orderId, (err, rows) => (err ? reject(err) : resolve(rows?.[0]?.user_id || null)));
  });

const getLatestRefund = (orderId) =>
  new Promise((resolve, reject) => {
    Refund.getLatestByOrderId(orderId, (err, rows) => (err ? reject(err) : resolve(rows?.[0] || null)));
  });

const renderForm = (res, data) => res.render('userRequestRefund', data);


const parseRiskDetails = (raw) => {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return { raw };
  }
};

const RefundController = {
    async showAdminDetail(req, res) {
    const refundId = Number(req.params?.id || 0);
    if (!refundId) return res.redirect('/orderDashboard');

    try {
      const refund = await new Promise((resolve, reject) => {
        Refund.getById(refundId, (err, rows) => (err ? reject(err) : resolve(rows?.[0] || null)));
      });
      if (!refund) {
        if (req.flash) req.flash('error', 'Refund request not found.');
        return res.redirect('/orderDashboard');
      }

      const userRows = await queryAsync('SELECT username, email FROM users WHERE user_id = ? LIMIT 1', [refund.user_id]);
      const user = userRows?.[0] || {};

      const riskRows = await RiskFlag.listByUser(refund.user_id, { limit: 10 });
      const riskFlags = (riskRows || []).map((flag) => ({
        ...flag,
        details: parseRiskDetails(flag.details)
      }));

      return res.render('adminRefundDetail', {
        refund: {
          ...refund,
          username: user.username,
          email: user.email
        },
        riskFlags
      });
    } catch (err) {
      console.error('refund detail error:', err);
      if (req.flash) req.flash('error', 'Failed to load refund request.');
      return res.redirect('/orderDashboard');
    }
  },

async showRequestForm(req, res) {
    const userId = req.session?.user_id;
    const orderId = Number(req.query.order_id || 0);
    const orderItemId = Number(req.query.order_item_id || 0);
    const viewOnly = String(req.query.view || '').toLowerCase() === '1' || String(req.query.view || '').toLowerCase() === 'true';

    if (!userId || !orderId) {
      return res.redirect('/allTransactions');
    }

    try {
      const order = await getOrderForUser(orderId, userId);
      if (!order) {
        return renderForm(res, {
          orderId,
          orderItemId,
          items: [],
          totalQty: 0,
          totalRefundable: 0,
          amount: '',
          paymentMethod: '',
          success: undefined,
          error: 'Order not found or not yours.'
        });
      }

      const itemRows = await queryAsync(
        `
        SELECT oi.order_item_id, oi.quantity, oi.item_total, p.product_name,
               o.subtotal AS order_subtotal, o.discount_amount AS order_discount, o.shipping_fee AS order_shipping,
               o.tax_amount AS order_tax, o.total_amount AS order_total
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.order_id
        LEFT JOIN products p ON oi.product_id = p.product_id
        WHERE oi.order_id = ? AND o.user_id = ?
        ORDER BY oi.order_item_id ASC
        `,
        [orderId, userId]
      );

      const orderSubtotal = Number(itemRows?.[0]?.order_subtotal || 0);
      const orderDiscount = Math.max(Number(itemRows?.[0]?.order_discount || 0), 0);
      const orderShipping = Math.max(Number(itemRows?.[0]?.order_shipping || 0), 0);
      const orderTax = Math.max(Number(itemRows?.[0]?.order_tax || 0), 0);
      const orderTotal = Math.max(Number(itemRows?.[0]?.order_total || 0), 0);
      const discountOnItems = Math.min(orderDiscount, orderSubtotal);
      const items = (itemRows || []).map((item) => {
        const maxQty = Number(item.quantity || 0);
        const itemTotal = Number(item.item_total || 0);
        const discountShare = orderSubtotal > 0 ? (discountOnItems * (itemTotal / orderSubtotal)) : 0;
        const refundableItemTotal = Math.max(itemTotal - discountShare, 0);
        const unitRefundable = maxQty ? refundableItemTotal / maxQty : 0;
        return {
          order_item_id: item.order_item_id,
          name: item.product_name || 'Item',
          max_qty: maxQty,
          refundable_total: refundableItemTotal,
          refundable_unit: unitRefundable
        };
      });
      const totalRefundable = items.reduce((sum, item) => sum + Number(item.refundable_total || 0), 0);
      const totalQty = items.reduce((sum, item) => sum + Number(item.max_qty || 0), 0);
      if (!items.length) {
        return renderForm(res, {
          orderId,
          orderItemId,
          items: [],
          totalQty: 0,
          totalRefundable: 0,
          amount: '',
          paymentMethod: '',
          success: undefined,
          error: 'No items found for this order.'
        });
      }

      const txn = await getLatestTransaction(orderId);
      const latestRefund = await getLatestRefund(orderId);
      if (viewOnly && !latestRefund) {
        return renderForm(res, {
          orderId,
          orderItemId,
          items,
          totalQty,
          totalRefundable,
          amount: '',
          paymentMethod: '',
          refundStatus: '',
          refundReference: '',
          selectedItemId: orderItemId || null,
          shippingFee: orderShipping,
          orderTotal,
          rejectedCount: 0,
          success: undefined,
          error: 'No refund request found for this order.',
          viewOnly: true,
          presetRefundItems: {},
          presetReason: '',
          presetDetails: '',
          presetRefundType: 'full'
        });
      }
      const rejectedRows = await queryAsync(
        'SELECT COUNT(*) AS rejected_count FROM refund_requests WHERE order_id = ? AND status = ?',
        [orderId, 'REJECTED']
      );
      const rejectedCount = Number(rejectedRows?.[0]?.rejected_count || 0);

      const success = (req.flash && req.flash('success')[0]) || undefined;
      const error = (req.flash && req.flash('error')[0]) || undefined;

      const displayMethod = normalizeMethod(latestRefund?.payment_method || guessPaymentMethod(txn));
      const displayAmount = txn?.amount ?? '';
      let presetRefundItems = {};
      let presetReason = '';
      let presetDetails = '';
      let presetRefundType = 'full';
      if (latestRefund?.refund_items) {
        try {
          const parsed = JSON.parse(latestRefund.refund_items);
          if (Array.isArray(parsed)) {
            parsed.forEach((item) => {
              const itemId = Number(item.order_item_id || item.orderItemId || item.id || 0);
              const qty = Number(item.qty ?? item.quantity ?? 0);
              if (itemId) presetRefundItems[itemId] = qty;
            });
          }
        } catch (parseErr) {
          presetRefundItems = {};
        }
      }
      presetReason = latestRefund?.reason || '';
      presetDetails = latestRefund?.details || '';
      if (Object.keys(presetRefundItems).length) {
        const isPartial = items.some((item) => {
          const selectedQty = Number(presetRefundItems[item.order_item_id] ?? 0);
          return selectedQty < Number(item.max_qty || 0);
        });
        presetRefundType = isPartial ? 'partial' : 'full';
      }
        return renderForm(res, {
          orderId,
          orderItemId,
          items,
          totalQty,
          totalRefundable,
          amount: displayAmount,
          paymentMethod: displayMethod,
          refundStatus: latestRefund?.status || '',
          refundReference: latestRefund?.refund_reference || '',
          selectedItemId: orderItemId || null,
          shippingFee: orderShipping,
          orderTax,
          orderTotal,
          rejectedCount,
          success,
          error,
          viewOnly,
          presetRefundItems,
          presetReason,
          presetDetails,
          presetRefundType
        });
    } catch (err) {
      console.error('refundRequest form error:', err);
      return renderForm(res, {
        orderId,
        items: [],
        totalQty: 0,
        totalRefundable: 0,
        amount: '',
        paymentMethod: '',
        rejectedCount: 0,
        success: undefined,
        error: 'Failed to load refund request. Please try again.'
      });
    }
  },

  async submitRequest(req, res) {
    const userId = req.session?.user_id;
    const orderId = Number(req.body?.order_id || 0);
    const orderItemId = Number(req.body?.order_item_id || 0);
    const reason = (req.body?.reason || '').trim();
    const details = (req.body?.details || '').trim();
    const refundItemsRaw = req.body?.refund_items || '';

    if (!userId || !orderId || !reason) {
      return renderForm(res, {
        orderId,
        orderItemId,
        items: [],
        totalQty: 0,
        totalRefundable: 0,
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
          items: [],
          totalQty: 0,
          totalRefundable: 0,
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
          items: [],
          totalQty: 0,
          totalRefundable: 0,
          amount: '',
          paymentMethod: '',
          success: undefined,
          error: 'No payment record found for this order.'
        });
      }

      const latestRefund = await getLatestRefund(orderId);
      if (latestRefund && ['PENDING', 'APPROVED', 'REFUNDED'].includes(String(latestRefund.status || '').toUpperCase())) {
        return renderForm(res, {
          orderId,
          orderItemId,
          items: [],
          totalQty: 0,
          totalRefundable: 0,
          amount: txn.amount,
          paymentMethod: guessPaymentMethod(txn),
          refundStatus: latestRefund.status,
          refundReference: latestRefund.refund_reference,
          success: undefined,
          error: 'A refund has already been submitted for this order.'
        });
      }

      const alreadyRefunded = await queryAsync(
        "SELECT refund_id FROM refund_requests WHERE order_id = ? AND status IN ('APPROVED','REFUNDED') LIMIT 1",
        [orderId]
      );
      if (alreadyRefunded && alreadyRefunded.length > 0) {
        return renderForm(res, {
          orderId,
          orderItemId,
          items: [],
          totalQty: 0,
          totalRefundable: 0,
          amount: txn.amount,
          paymentMethod: guessPaymentMethod(txn),
          refundStatus: latestRefund?.status || '',
          refundReference: latestRefund?.refund_reference || '',
          success: undefined,
          error: 'Refund already completed for this order.'
        });
      }

      const attemptRows = await queryAsync(
        'SELECT COUNT(*) AS rejected_count FROM refund_requests WHERE order_id = ? AND status = ?',
        [orderId, 'REJECTED']
      );
      const rejectedCount = Number(attemptRows?.[0]?.rejected_count || 0);
      if (rejectedCount >= 3) {
        return renderForm(res, {
          orderId,
          orderItemId,
          items: [],
          totalQty: 0,
          totalRefundable: 0,
          amount: txn.amount,
          paymentMethod: guessPaymentMethod(txn),
          refundStatus: latestRefund?.status || '',
          refundReference: latestRefund?.refund_reference || '',
          success: undefined,
          error: 'Refund attempt limit reached. Please contact support.'
        });
      }

      const itemRows = await queryAsync(
        `
        SELECT oi.order_item_id, oi.quantity, oi.item_total, p.product_name,
               o.subtotal AS order_subtotal, o.discount_amount AS order_discount, o.shipping_fee AS order_shipping,
               o.tax_amount AS order_tax, o.total_amount AS order_total
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.order_id
        LEFT JOIN products p ON oi.product_id = p.product_id
        WHERE oi.order_id = ? AND o.user_id = ?
        ORDER BY oi.order_item_id ASC
        `,
        [orderId, userId]
      );

      const orderSubtotal = Number(itemRows?.[0]?.order_subtotal || 0);
      const orderDiscount = Math.max(Number(itemRows?.[0]?.order_discount || 0), 0);
      const orderShipping = Math.max(Number(itemRows?.[0]?.order_shipping || 0), 0);
      const orderTax = Math.max(Number(itemRows?.[0]?.order_tax || 0), 0);
      const orderTotal = Math.max(Number(itemRows?.[0]?.order_total || 0), 0);
      const discountOnItems = Math.min(orderDiscount, orderSubtotal);
      const items = (itemRows || []).map((item) => {
        const maxQty = Number(item.quantity || 0);
        const itemTotal = Number(item.item_total || 0);
        const discountShare = orderSubtotal > 0 ? (discountOnItems * (itemTotal / orderSubtotal)) : 0;
        const refundableItemTotal = Math.max(itemTotal - discountShare, 0);
        const unitRefundable = maxQty ? refundableItemTotal / maxQty : 0;
        return {
          order_item_id: item.order_item_id,
          name: item.product_name || 'Item',
          max_qty: maxQty,
          refundable_total: refundableItemTotal,
          refundable_unit: unitRefundable
        };
      });
      const totalQty = items.reduce((sum, item) => sum + Number(item.max_qty || 0), 0);
      const totalRefundable = items.reduce((sum, item) => sum + Number(item.refundable_total || 0), 0);
      const itemMap = new Map(items.map((item) => [Number(item.order_item_id), item]));
      if (!items.length) {
        return renderForm(res, {
          orderId,
          orderItemId,
          items: [],
          totalQty: 0,
          totalRefundable: 0,
          amount: txn.amount,
          paymentMethod: guessPaymentMethod(txn),
          refundStatus: latestRefund?.status || '',
          refundReference: latestRefund?.refund_reference || '',
          shippingFee: orderShipping,
          orderTotal,
          success: undefined,
          error: 'No items found for this order.'
        });
      }

      let requestedItems = [];
      if (refundItemsRaw) {
        try {
          const parsed = JSON.parse(refundItemsRaw);
          if (Array.isArray(parsed)) requestedItems = parsed;
        } catch (parseErr) {
          return renderForm(res, {
            orderId,
            orderItemId,
            items,
            totalQty,
            totalRefundable,
            amount: txn.amount,
            paymentMethod: guessPaymentMethod(txn),
            refundStatus: latestRefund?.status || '',
            refundReference: latestRefund?.refund_reference || '',
            shippingFee: orderShipping,
            orderTotal,
            success: undefined,
            error: 'Invalid refund selection. Please try again.'
          });
        }
      } else if (orderItemId) {
        const qtyFallback = Number(req.body?.refund_qty || req.body?.quantity || 0);
        requestedItems = [{ order_item_id: orderItemId, qty: qtyFallback }];
      }

      const normalized = new Map();
      requestedItems.forEach((item) => {
        const itemId = Number(item.order_item_id || item.orderItemId || item.id || 0);
        const qty = Number(item.qty ?? item.quantity ?? 0);
        if (!itemId) return;
        const existing = normalized.get(itemId) || 0;
        normalized.set(itemId, existing + qty);
      });

      const selectedItems = Array.from(normalized.entries())
        .map(([itemId, qty]) => ({ order_item_id: itemId, qty }))
        .filter((item) => item.qty > 0);

      if (!selectedItems.length) {
        return renderForm(res, {
          orderId,
          orderItemId,
          items,
          totalQty,
          totalRefundable,
          amount: txn.amount,
          paymentMethod: guessPaymentMethod(txn),
          refundStatus: latestRefund?.status || '',
          refundReference: latestRefund?.refund_reference || '',
          shippingFee: orderShipping,
          orderTotal,
          success: undefined,
          error: 'Select at least one item to refund.'
        });
      }

      let totalRefundAmount = 0;
      let totalRefundQty = 0;
      const refundItemsPayload = [];

      for (const selection of selectedItems) {
        const item = itemMap.get(Number(selection.order_item_id));
        if (!item) {
          return renderForm(res, {
            orderId,
            orderItemId,
            items,
            totalQty,
            totalRefundable,
            amount: txn.amount,
            paymentMethod: guessPaymentMethod(txn),
            refundStatus: latestRefund?.status || '',
            refundReference: latestRefund?.refund_reference || '',
            shippingFee: orderShipping,
            orderTotal,
            success: undefined,
            error: 'Invalid refund item selection.'
          });
        }
        const safeQty = Math.min(Math.max(Number(selection.qty || 0), 0), Number(item.max_qty || 0));
        if (!safeQty) continue;
        const lineRefund = toTwoDp(safeQty * Number(item.refundable_unit || 0));
        totalRefundAmount += lineRefund;
        totalRefundQty += safeQty;
        refundItemsPayload.push({
          order_item_id: item.order_item_id,
          name: item.name,
          qty: safeQty,
          max_qty: item.max_qty,
          unit_refund: toTwoDp(item.refundable_unit || 0),
          line_refund: lineRefund
        });
      }

      totalRefundAmount = toTwoDp(totalRefundAmount);
      const totalPurchasedQty = items.reduce((sum, item) => sum + Number(item.max_qty || 0), 0);
      const isFullRefund = totalRefundQty === totalPurchasedQty && totalPurchasedQty > 0;
      if (isFullRefund) {
        const fallbackFull = toTwoDp(totalRefundAmount + orderShipping + orderTax);
        totalRefundAmount = orderTotal > 0 ? toTwoDp(orderTotal) : fallbackFull;
      }
      if (!refundItemsPayload.length || totalRefundAmount <= 0) {
        return renderForm(res, {
          orderId,
          orderItemId,
          items,
          totalQty,
          totalRefundable,
          amount: txn.amount,
          paymentMethod: guessPaymentMethod(txn),
          refundStatus: latestRefund?.status || '',
          refundReference: latestRefund?.refund_reference || '',
          shippingFee: orderShipping,
          orderTotal,
          success: undefined,
          error: 'Refund amount is zero after voucher discount.'
        });
      }

      const displayMethod = guessPaymentMethod(txn);
      const orderItemForRow = refundItemsPayload.length === 1 ? refundItemsPayload[0].order_item_id : null;
      const refundQtyForRow = refundItemsPayload.length === 1 ? refundItemsPayload[0].qty : totalRefundQty;

      await new Promise((resolve, reject) => {
        Refund.create(
          {
            order_id: orderId,
            user_id: userId,
            order_item_id: orderItemForRow,
            refund_qty: refundQtyForRow,
            payment_method: displayMethod,
            amount: totalRefundAmount,
            reason,
            details: details || null,
            refund_items: JSON.stringify(refundItemsPayload),
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

      const query = `order_id=${encodeURIComponent(orderId)}`;
      return res.redirect(`/refund-request?${query}`);
    } catch (err) {
      console.error('refund submit error:', err);
      return renderForm(res, {
        orderId,
        items: [],
        totalQty: 0,
        totalRefundable: 0,
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
      res.render('adminRequestRefund', { refunds: rows, success, error });
    } catch (err) {
      console.error('refund list error:', err);
      res.status(500).render('adminRequestRefund', { refunds: [], error: 'Failed to load refunds.' });
    }
  },

  async approve(req, res) {
    const refundId = Number(req.params?.id || 0);
    if (!refundId) return res.redirect('/orderDashboard');

    try {
      const refund = await new Promise((resolve, reject) => {
        Refund.getById(refundId, (err, rows) => (err ? reject(err) : resolve(rows?.[0] || null)));
      });
      if (!refund) {
        if (req.flash) req.flash('error', 'Refund request not found.');
        return res.redirect('/orderDashboard');
      }

      const status = String(refund.status || '').toUpperCase();
      if (status !== 'PENDING') {
        if (req.flash) req.flash('error', `Refund is already ${status || 'processed'}.`);
        return res.redirect('/orderDashboard');
      }

      const orderUserId = await getOrderUserId(refund.order_id);
      if (!orderUserId || Number(orderUserId) !== Number(refund.user_id)) {
        if (req.flash) req.flash('error', 'Refund request does not match the original order user.');
        return res.redirect('/orderDashboard');
      }

      const txn = await getLatestTransaction(refund.order_id);
      if (!txn) {
        if (req.flash) req.flash('error', 'No payment record found for this order.');
        return res.redirect('/orderDashboard');
      }

      const txnMethod = normalizeMethod(txn?.payment_method);
      const method = normalizeMethod(refund.payment_method || txn?.payment_method);
      const isWalletLike = (value) => value === 'WALLET' || value === 'NETS';

      if (method === 'PAYPAL' && txnMethod !== 'PAYPAL') {
        if (req.flash) req.flash('error', 'Refund method does not match the original payment.');
        return res.redirect('/orderDashboard');
      }
      if (isWalletLike(method) && !isWalletLike(txnMethod)) {
        if (req.flash) req.flash('error', 'Refund method does not match the original payment.');
        return res.redirect('/orderDashboard');
      }
      if (method === 'PAYPAL') {
        const txnRef = txn?.paypal_order_id || null;
        const refundRef = refund.payment_reference || null;
        if (!txnRef) {
          if (req.flash) req.flash('error', 'Missing PayPal reference for the original payment.');
          return res.redirect('/orderDashboard');
        }
        if (refundRef && txnRef && refundRef !== txnRef) {
          if (req.flash) req.flash('error', 'Refund reference does not match the original payment.');
          return res.redirect('/orderDashboard');
        }
      }

      const alreadyRefunded = await queryAsync(
        "SELECT refund_id FROM refund_requests WHERE order_id = ? AND status IN ('APPROVED','REFUNDED') LIMIT 1",
        [refund.order_id]
      );
      if (alreadyRefunded && alreadyRefunded.length > 0) {
        if (req.flash) req.flash('error', 'Refund already completed for this order.');
        return res.redirect('/refund-requests');
      }

      const amount = toTwoDp(refund.amount || txn?.amount || 0);
      const currency = txn?.currency || 'SGD';
      let refundReference = null;
      let finalStatus = 'APPROVED';

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
              finalStatus = 'APPROVED';
            } else {
              finalStatus = 'FAILED';
            }
          }
        }
      } else if (method === 'WALLET' || method === 'NETS') {
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

      if (finalStatus === 'APPROVED') {
        const orderMeta = await queryAsync('SELECT voucher_id, total_amount FROM orders WHERE order_id = ? LIMIT 1', [refund.order_id]);
        const voucherId = orderMeta?.[0]?.voucher_id || null;
        const orderTotal = Number(orderMeta?.[0]?.total_amount || 0);
        const refundAmount = Number(refund.amount || 0);
        const nextPaymentStatus = refundAmount && orderTotal && refundAmount < orderTotal ? 'PARTIALLY_REFUNDED' : 'REFUNDED';
        await queryAsync('UPDATE orders SET payment_status = ? WHERE order_id = ?', [nextPaymentStatus, refund.order_id]);
        // voucherId already resolved above
        if (voucherId) {
          await queryAsync(
            'UPDATE vouchers SET used_count = CASE WHEN used_count > 0 THEN used_count - 1 ELSE 0 END WHERE voucher_id = ?',
            [voucherId]
          );
        }
      }

      if (req.flash) {
        req.flash(
          finalStatus === 'APPROVED' ? 'success' : 'error',
          finalStatus === 'APPROVED' ? 'Refund approved and processed.' : 'Refund failed to process.'
        );
      }
      return res.redirect('/orderDashboard');
    } catch (err) {
      console.error('refund approve error:', err);
      if (req.flash) req.flash('error', err.message || 'Refund approval failed.');
      return res.redirect('/orderDashboard');
    }
  },

  async reject(req, res) {
    const refundId = Number(req.params?.id || 0);
    if (!refundId) return res.redirect('/orderDashboard');

    try {
      const refund = await new Promise((resolve, reject) => {
        Refund.getById(refundId, (err, rows) => (err ? reject(err) : resolve(rows?.[0] || null)));
      });
      if (!refund) {
        if (req.flash) req.flash('error', 'Refund request not found.');
        return res.redirect('/orderDashboard');
      }
      const status = String(refund.status || '').toUpperCase();
      if (status !== 'PENDING') {
        if (req.flash) req.flash('error', `Refund is already ${status || 'processed'}.`);
        return res.redirect('/orderDashboard');
      }

      await new Promise((resolve, reject) => {
        Refund.updateStatus(refundId, 'REJECTED', null, (err) => (err ? reject(err) : resolve()));
      });

      const rejectedRows = await queryAsync(
        'SELECT COUNT(*) AS rejected_count FROM refund_requests WHERE order_id = ? AND status = ?',
        [refund.order_id, 'REJECTED']
      );
      const rejectedCount = Number(rejectedRows?.[0]?.rejected_count || 0);
      if (rejectedCount >= 3) {
        await queryAsync(
          'UPDATE orders SET delivery_status = ? WHERE order_id = ?',
          ['COMPLETED', refund.order_id]
        );
      }

      if (req.flash) req.flash('success', 'Refund request rejected.');
      return res.redirect('/orderDashboard');
    } catch (err) {
      console.error('refund reject error:', err);
      if (req.flash) req.flash('error', 'Failed to reject refund.');
      return res.redirect('/orderDashboard');
    }
  }
};

module.exports = RefundController;
