const paypalService = require('../services/paypal');
const netsService = require('../services/Nets');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const Payment = require('../models/Payment');
const Cart = require('../models/Cart');
const db = require('../db');

const { toTwoDp } = Payment;
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';

const createTopupOrder = (userId, amount) =>
  new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO orders (user_id, subtotal, discount_amount, shipping_fee, tax_amount, total_amount)
      VALUES (?, ?, 0, 0, 0, ?)
    `;
    const safeAmt = toTwoDp(amount);
    db.query(sql, [userId, safeAmt, safeAmt], (err, result) => {
      if (err) return reject(err);
      resolve(result?.insertId);
    });
  });

const WalletController = {
  async viewWallet(req, res) {
    const userId = req.session?.user_id;
    if (!userId) {
      return res.redirect('/login');
    }

    try {
      const wallet = await Wallet.ensureWallet(userId);
      const transactions = await WalletTransaction.listByUser(userId, { limit: 100 });
      const success = (req.flash && req.flash('success')[0]) || undefined;
      const error = (req.flash && req.flash('error')[0]) || undefined;

      res.render('digitalWallet', {
        wallet,
        transactions,
        paypalClientId: PAYPAL_CLIENT_ID,
        user: req.session.user || null,
        success,
        error
      });
    } catch (err) {
      console.error('viewWallet error:', err);
      return res.status(500).render('digitalWallet', {
        wallet: { balance: 0 },
        transactions: [],
        paypalClientId: PAYPAL_CLIENT_ID,
        user: req.session.user || null,
        success: undefined,
        error: 'Failed to load wallet. Please try again.'
      });
    }
  },

  async createPaypalTopupOrder(req, res) {
    const userId = req.session?.user_id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const amount = toTwoDp(req.body?.amount || 0);
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Top-up amount must be greater than 0' });
    }

    try {
      const order = await paypalService.createOrder(amount);
      req.session.walletTopup = {
        paypalOrderId: order?.id || null,
        amount
      };

      return res.json({
        id: order?.id,
        amount,
        currency: 'SGD'
      });
    } catch (err) {
      console.error('createPaypalTopupOrder error:', err);
      const message = err.message || 'Failed to create PayPal top-up order';
      return res.status(500).json({ error: message });
    }
  },

  async capturePaypalTopup(req, res) {
    const userId = req.session?.user_id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { orderId } = req.body || {};
    if (!orderId) return res.status(400).json({ error: 'orderId is required' });

    const pending = req.session?.walletTopup || null;
    if (pending?.paypalOrderId && pending.paypalOrderId !== orderId) {
      return res.status(400).json({ error: 'PayPal order mismatch. Please refresh and try again.' });
    }

    try {
      const captureData = await paypalService.captureOrder(orderId);
      const capture = captureData?.purchase_units?.[0]?.payments?.captures?.[0];
      const captureStatus = capture?.status || captureData?.status;
      if (captureStatus && captureStatus !== 'COMPLETED') {
        return res.status(400).json({ error: 'Payment not completed', details: captureStatus });
      }

      const paidAmount = toTwoDp(capture?.amount?.value || pending?.amount || 0);
      if (!paidAmount || paidAmount <= 0) {
        return res.status(400).json({ error: 'Invalid capture amount returned by PayPal' });
      }

      // Credit wallet inside its own transaction
      await Wallet.credit(
        userId,
        paidAmount,
        {
          txnType: 'TOPUP',
          referenceType: 'TOPUP',
          referenceId: orderId,
          paymentMethod: 'PAYPAL',
          description: 'Wallet top-up via PayPal'
        },
        { connection: db, manageTransaction: true }
      );

      const topupOrderId = await createTopupOrder(userId, paidAmount).catch(() => null);

      await Payment.recordTransaction({
        order_id: topupOrderId,
        paypal_order_id: orderId,
        payer_id: captureData?.payer?.payer_id || 'paypal_' + userId,
        payer_email: captureData?.payer?.email_address || req.session?.user?.email || null,
        amount: paidAmount,
        currency: capture?.amount?.currency_code || 'SGD',
        status: captureStatus || 'COMPLETED',
        payment_method: 'WALLET_TOPUP_PP' // keep under DB column length
      });

      req.session.walletTopup = null;

      return res.json({ success: true, redirectUrl: '/digitalWallet' });
    } catch (err) {
      console.error('capturePaypalTopup error:', err);
      const message = err.message || 'Failed to capture PayPal top-up';
      return res.status(500).json({ error: message });
    }
  },

  async generateNetsTopup(req, res) {
    const userId = req.session?.user_id;
    if (!userId) {
      return res.render('transactionFail', {
        message: 'You must be logged in to top up your wallet.',
        returnUrl: '/login'
      });
    }

    const amount = toTwoDp(req.body?.amount || 0);
    if (!amount || amount <= 0) {
      return res.status(400).render('transactionFail', {
        message: 'Top-up amount must be greater than 0.',
        returnUrl: '/digitalWallet'
      });
    }

    // Reuse NETS QR flow with a wallet flag
    req.body.cartTotal = amount;
    req.body.walletTopup = '1';
    req.body.voucher_code = '';
    return netsService.generateQrCode(req, res);
  },

  async payWithWallet(req, res) {
    const userId = req.session?.user_id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const role = (req.session?.role || req.session?.user?.role || '').toLowerCase();
    const bodyVoucher = (req.body?.voucher_code || '').trim();
    const sessionVoucher = (req.session?.appliedVoucher?.code || '').trim();
    const voucherCode = bodyVoucher || sessionVoucher;

    try {
      const quote = await Payment.buildQuote(userId, role, voucherCode);
      const total = toTwoDp(quote.pricing.total);

      if (total <= 0) {
        return res.status(400).json({ error: 'Cart total must be greater than 0' });
      }

      const wallet = await Wallet.ensureWallet(userId);
      if ((wallet?.balance || 0) < total) {
        return res.status(400).json({ error: 'Insufficient wallet balance' });
      }

      await new Promise((resolve, reject) => {
        db.beginTransaction((txErr) => (txErr ? reject(txErr) : resolve()));
      });

      let orderSummary;
      try {
        // Use shared checkout logic without internal commit/rollback (managed above)
        orderSummary = await new Promise((resolve, reject) => {
          Cart.checkoutWithConnection(
            db,
            {
              voucher_id: quote.voucherId ?? null,
              shipping_fee: quote.pricing.shippingFee,
              tax_rate: quote.pricing.taxRate,
              discount_amount: quote.pricing.discountAmount
            },
            userId,
            (err, summary) => (err ? reject(err) : resolve(summary)),
            false
          );
        });

        await Wallet.debit(
          userId,
          total,
          {
            txnType: 'PURCHASE_DEBIT',
            referenceType: 'ORDER',
            referenceId: orderSummary?.order_id || null,
            paymentMethod: 'WALLET',
            description: 'Order paid with wallet balance'
          },
          { connection: db, manageTransaction: false }
        );

        await Payment.recordTransaction({
          order_id: orderSummary?.order_id || null,
          paypal_order_id: 'WALLET-' + Date.now(),
          payer_id: 'wallet_' + userId,
          payer_email: req.session?.user?.email || null,
          amount: total,
          currency: 'SGD',
          status: 'COMPLETED',
          payment_method: 'WALLET'
        });

        await new Promise((resolve, reject) => {
          db.commit((commitErr) => (commitErr ? reject(commitErr) : resolve()));
        });
      } catch (err) {
        await new Promise((resolve) => db.rollback(() => resolve()));
        throw err;
      }

      // Build invoice view model
      req.session.invoice = {
        id: `INV-${Date.now()}`,
        user: req.session?.user?.username || req.session?.user?.email || 'guest',
        date: new Date(),
        items: quote.items.map((item) => ({
          productName: item.productName,
          quantity: item.quantity,
          price: item.price,
          subtotal: item.subtotal
        })),
        subtotal: toTwoDp(orderSummary.subtotal),
        shippingFee: toTwoDp(orderSummary.shipping_fee),
        taxAmount: toTwoDp(orderSummary.tax_amount),
        discountAmount: toTwoDp(orderSummary.discount_amount),
        total: toTwoDp(orderSummary.total_amount)
      };

      req.session.appliedVoucher = null;
      return res.json({ success: true, redirectUrl: '/invoice-confirmation' });
    } catch (err) {
      console.error('payWithWallet error:', err);
      const message = err.message || 'Failed to pay with wallet.';
      return res.status(500).json({ error: message });
    }
  }
};

// expose helper for reuse (e.g., NETS success handler)
WalletController.createTopupOrder = createTopupOrder;

module.exports = WalletController;
