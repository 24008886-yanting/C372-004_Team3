const paypalService = require('../services/paypal');
const netsService = require('../services/nets');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const RiskFlag = require('../models/RiskFlag');
const Payment = require('../models/Payment');
const Cart = require('../models/Cart');
const db = require('../db');

const { toTwoDp } = Payment;
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';

const MAX_TOPUP_PER_TXN = Number(process.env.WALLET_MAX_TOPUP_PER_TXN || 300);
const DAILY_TOPUP_CAP = Number(process.env.WALLET_DAILY_TOPUP_CAP || 500);

const RAPID_TOPUP_WINDOW_MINUTES = Number(process.env.WALLET_RAPID_TOPUP_WINDOW_MINUTES || 10);
const RAPID_TOPUP_COUNT = Number(process.env.WALLET_RAPID_TOPUP_COUNT || 4);
const RAPID_TOPUP_SUM_WINDOW_MINUTES = Number(process.env.WALLET_RAPID_TOPUP_SUM_WINDOW_MINUTES || 30);
const RAPID_TOPUP_SUM_CAP = Number(process.env.WALLET_RAPID_TOPUP_SUM_CAP || 450);

const enforceTopupLimits = async (userId, amount) => {
  if (amount > MAX_TOPUP_PER_TXN) {
    try {
      await RiskFlag.create(userId, 'TOPUP_PER_TXN_CAP_EXCEEDED', 'Top-up per-transaction cap exceeded', {
        cap: MAX_TOPUP_PER_TXN,
        attemptedAmount: amount
      });
    } catch (flagErr) {
      // ignore risk flag logging errors
    }
    const err = new Error(`Top-up exceeds per-transaction limit of S$${MAX_TOPUP_PER_TXN}`);
    err.statusCode = 400;
    throw err;
  }

  const wallet = await Wallet.ensureWallet(userId);
  const balanceCap = Wallet.BALANCE_CAP || 1000;
  if (toTwoDp((wallet?.balance || 0) + amount) > balanceCap) {
    try {
      await RiskFlag.create(userId, 'WALLET_BALANCE_CAP_EXCEEDED', 'Wallet balance cap exceeded', {
        cap: balanceCap,
        balanceBefore: wallet?.balance || 0,
        attemptedAmount: amount
      });
    } catch (flagErr) {
      // ignore risk flag logging errors
    }
    const err = new Error(`Wallet balance cap of S$${balanceCap} would be exceeded`);
    err.statusCode = 400;
    throw err;
  }

  const todayTotal = await WalletTransaction.getDailyTopupTotal(userId);
  if (toTwoDp(todayTotal + amount) > DAILY_TOPUP_CAP) {
    try {
      await RiskFlag.create(userId, 'TOPUP_DAILY_CAP_EXCEEDED', 'Daily top-up cap exceeded', {
        cap: DAILY_TOPUP_CAP,
        todayTotal,
        attemptedAmount: amount
      });
    } catch (flagErr) {
      // ignore risk flag logging errors
    }
    const err = new Error(`Daily top-up cap of S$${DAILY_TOPUP_CAP} exceeded`);
    err.statusCode = 400;
    throw err;
  }
};


const flagRapidTopup = async (userId) => {
  try {
    const [count, sum] = await Promise.all([
      WalletTransaction.countTopupsInWindow(userId, RAPID_TOPUP_WINDOW_MINUTES),
      WalletTransaction.sumTopupsInWindow(userId, RAPID_TOPUP_SUM_WINDOW_MINUTES)
    ]);

    if (count >= RAPID_TOPUP_COUNT) {
      await RiskFlag.create(userId, 'TOPUP_RAPID_BURST', 'Rapid top-up burst detected', {
        windowMinutes: RAPID_TOPUP_WINDOW_MINUTES,
        count,
        threshold: RAPID_TOPUP_COUNT
      });
    }

    if (sum >= RAPID_TOPUP_SUM_CAP) {
      await RiskFlag.create(userId, 'TOPUP_RAPID_SUM', 'Rapid top-up sum threshold exceeded', {
        windowMinutes: RAPID_TOPUP_SUM_WINDOW_MINUTES,
        total: sum,
        threshold: RAPID_TOPUP_SUM_CAP
      });
    }
  } catch (flagErr) {
    // ignore risk flag logging errors
  }
};

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


const normalizeQrCode = (qrData) => {
  if (!qrData) return null;
  const raw =
    qrData.qr_code ||
    qrData.qr_code_url ||
    qrData.qrCode ||
    qrData.qrCodeUrl ||
    qrData.qr_code_str ||
    null;

  if (!raw) return null;
  if (/^data:|^https?:\/\//i.test(raw)) return raw;
  return `data:image/png;base64,${raw}`;
};

const extractStatus = (payload) => {
  const statusRaw =
    payload?.txn_status ||
    payload?.status ||
    payload?.txnStatus ||
    payload?.txn_state ||
    '';

  const code =
    payload?.response_code ||
    payload?.resp_code ||
    payload?.status_code ||
    payload?.statusCode ||
    '';

  const message =
    payload?.response_message ||
    payload?.resp_message ||
    payload?.message ||
    '';

  return {
    status: String(statusRaw || '').toUpperCase(),
    code: String(code || '').toUpperCase(),
    message: message || ''
  };
};

const isSuccessStatus = ({ status, code }) =>
  ['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'PAID', 'APPROVED'].includes(status) ||
  code === '00';

const isFailStatus = ({ status, code }) =>
  ['FAILED', 'FAIL', 'DECLINED', 'CANCELLED', 'CANCELED', 'EXPIRED', 'TIMEOUT', 'REJECTED'].includes(status) ||
  (code && code !== '00' && status !== 'PENDING' && status !== 'IN_PROGRESS');

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
      await enforceTopupLimits(userId, amount);
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
      const status = err.statusCode || 500;
      const message = err.message || 'Failed to create PayPal top-up order';
      return res.status(status).json({ error: message });
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

      await enforceTopupLimits(userId, paidAmount);

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

      await flagRapidTopup(userId);

      await Payment.recordTransaction({
        order_id: null,
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
      const status = err.statusCode || 500;
      const message = err.message || 'Failed to capture PayPal top-up';
      return res.status(status).json({ error: message });
    }
  },



  async createNetsTopup(req, res) {
    const userId = req.session?.user_id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const amount = toTwoDp(req.body?.amount || 0);
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Top-up amount must be greater than 0' });
    }

    try {
      await enforceTopupLimits(userId, amount);
      const qrResponse = await netsService.requestQr({ amount });
      const qrData = qrResponse?.qrData || null;
      const qrCodeUrl = normalizeQrCode(qrData);
      const txnRetrievalRef = qrResponse?.txnRetrievalRef || qrData?.txn_retrieval_ref || null;

      if (!qrCodeUrl || !txnRetrievalRef) {
        return res.status(500).json({ error: 'Failed to generate NETS QR. Please try again.' });
      }

      req.session.walletNetsTopup = {
        status: 'PENDING',
        createdAt: Date.now(),
        txnRetrievalRef,
        courseInitId: qrResponse?.courseInitId || null,
        amount
      };

      req.session.walletNetsQrView = {
        title: 'NETS QR Top-up',
        qrCodeUrl,
        total: amount.toFixed(2),
        timer: Number(qrData?.time_left || qrData?.qr_expiry_seconds || 300),
        orderExpiryMinutes: 15,
        txnRetrievalRef,
        courseInitId: qrResponse?.courseInitId || null,
        successRedirect: '/digitalWallet',
        failRedirect: '/wallet/nets/fail',
        cancelRedirect: '/digitalWallet',
        sseUrl: `/sse/nets/wallet-status/${txnRetrievalRef}`
      };

      return res.json({ success: true, redirectUrl: '/wallet/nets/scan' });
    } catch (err) {
      console.error('NETS top-up create error:', err);
      const status = err.statusCode || 500;
      const message = err.message || 'Unable to start NETS top-up.';
      return res.status(status).json({ error: message });
    }
  },

  renderNetsTopupQr(req, res) {
    const viewData = req.session?.walletNetsQrView;
    if (!viewData) {
      if (req.flash) req.flash('error', 'No NETS top-up session found.');
      return res.redirect('/digitalWallet');
    }
    return res.render('netsQr', viewData);
  },

  async sseNetsTopupStatus(req, res) {
    const userId = req.session?.user_id;
    if (!userId) {
      res.status(401).end();
      return;
    }

    const txnRetrievalRef = req.params?.txnRetrievalRef;
    const pending = req.session?.walletNetsTopup;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const sendEvent = (payload) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    if (!pending || !txnRetrievalRef || pending.txnRetrievalRef !== txnRetrievalRef) {
      sendEvent({ fail: true, message: 'No pending NETS top-up.' });
      return res.end();
    }

    if (pending.status === 'COMPLETED') {
      sendEvent({ success: true, message: pending.resultMessage || 'Top-up completed.' });
      return res.end();
    }

    if (pending.status === 'FAILED') {
      sendEvent({ fail: true, message: pending.resultMessage || 'Top-up failed.' });
      return res.end();
    }

    let isClosed = false;
    let interval = null;
    const closeStream = () => {
      if (isClosed) return;
      isClosed = true;
      if (interval) clearInterval(interval);
      res.end();
    };

    req.on('close', closeStream);

    const poll = async () => {
      if (isClosed) return;
      try {
        const response = await netsService.queryStatus({ txnRetrievalRef, frontendTimeoutStatus: 0 });
        const data = response?.data || {};
        const result = data.result?.data || data.result || data.data || data;
        const statusInfo = extractStatus(result);

        if (isSuccessStatus(statusInfo)) {
          try {
            const amount = toTwoDp(pending.amount || 0);
            if (!amount || amount <= 0) {
              throw new Error('Invalid top-up amount.');
            }

            await Wallet.credit(
              userId,
              amount,
              {
                txnType: 'TOPUP',
                referenceType: 'TOPUP',
                referenceId: pending.txnRetrievalRef,
                paymentMethod: 'NETS_QR',
                description: 'Wallet top-up via NETS QR'
              },
              { connection: db, manageTransaction: true }
            );

            await Payment.recordTransaction({
              order_id: null,
              paypal_order_id: pending.txnRetrievalRef,
              payer_id: 'nets_' + userId,
              payer_email: req.session?.user?.email || null,
              amount: amount,
              currency: 'SGD',
              status: 'COMPLETED',
              payment_method: 'WALLET_TOPUP_NETS'
            });

            pending.status = 'COMPLETED';
            pending.resultMessage = statusInfo.message || 'Top-up completed.';
            if (req.flash) req.flash('success', 'Wallet top-up successful.');

            sendEvent({ success: true, message: pending.resultMessage });
            return closeStream();
          } catch (err) {
            console.error('NETS top-up finalize error:', err);
            pending.status = 'FAILED';
            pending.resultMessage = err.message || 'Top-up could not be finalized.';
            sendEvent({ fail: true, message: pending.resultMessage });
            return closeStream();
          }
        }

        if (isFailStatus(statusInfo)) {
          pending.status = 'FAILED';
          pending.resultMessage = statusInfo.message || 'Top-up failed.';
          sendEvent({ fail: true, message: pending.resultMessage });
          return closeStream();
        }

        sendEvent({ pending: true, status: statusInfo.status || 'PENDING' });
      } catch (err) {
        console.error('NETS top-up status query error:', err);
        sendEvent({ pending: true, status: 'PENDING' });
      }
    };

    await poll();
    interval = setInterval(poll, 3000);
  },

  renderNetsTopupFail(req, res) {
    const message = req.session?.walletNetsTopup?.resultMessage || 'Top-up was not completed.';
    return res.render('netsTxnFailStatus', { message, orderId: null });
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

WalletController.createTopupOrder = createTopupOrder;

module.exports = WalletController;


