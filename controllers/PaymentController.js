const paypalService = require('../services/paypal');
const netsService = require('../services/nets');
const Cart = require('../models/Cart');
const Payment = require('../models/Payment');
const { toTwoDp } = Payment;

const getVoucherCode = (req) => {
  const bodyVoucher = (req.body?.voucher_code || '').trim();
  const sessionVoucher = (req.session?.appliedVoucher?.code || '').trim();
  return bodyVoucher || sessionVoucher || null;
};

const buildInvoiceSession = (req, quote, orderSummary) => {
  req.session.invoice = {
    id: `INV-${Date.now()}`,
    user: req.session?.user?.username || req.session?.user?.email || 'guest',
    date: new Date(),
    items: (quote.items || []).map((item) => ({
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
};

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

const PaymentController = {
  async createPaypalOrder(req, res) {
    const userId = req.session?.user_id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const role = (req.session?.role || req.session?.user?.role || '').toLowerCase();
    const bodyVoucher = (req.body?.voucher_code || '').trim();
    const sessionVoucher = (req.session?.appliedVoucher?.code || '').trim();
    const voucherCode = bodyVoucher || sessionVoucher;

    try {
      const quote = await Payment.buildQuote(userId, role, voucherCode);
      const order = await paypalService.createOrder(toTwoDp(quote.pricing.total));

      req.session.pendingPayment = {
        paypalOrderId: order?.id || null,
        voucherCode: voucherCode || null,
        voucherId: quote.voucherId || null,
        quote
      };

      return res.json({
        id: order?.id,
        amount: toTwoDp(quote.pricing.total),
        currency: quote.pricing.currency
      });
    } catch (err) {
      console.error('PayPal create order error:', err);
      const message = err.message || 'Failed to create PayPal order';
      const status = message.toLowerCase().includes('empty') || message.toLowerCase().includes('stock') ? 400 : 500;
      return res.status(status).json({ error: message });
    }
  },

  async capturePaypalOrder(req, res) {
    const userId = req.session?.user_id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { orderId } = req.body || {};
    if (!orderId) return res.status(400).json({ error: 'orderId is required' });

    const role = (req.session?.role || req.session?.user?.role || '').toLowerCase();
    const pending = req.session?.pendingPayment || null;
    const bodyVoucher = (req.body?.voucher_code || '').trim();
    const sessionVoucher = (req.session?.appliedVoucher?.code || '').trim();
    const voucherCode = pending?.voucherCode || bodyVoucher || sessionVoucher || null;

    try {
      const quote = await Payment.buildQuote(userId, role, voucherCode);

      if (pending?.quote?.pricing?.total !== undefined) {
        const storedTotal = toTwoDp(pending.quote.pricing.total);
        if (storedTotal !== quote.pricing.total) {
          return res.status(409).json({ error: 'Cart changed after creating PayPal order. Please refresh and try again.' });
        }
      }

      if (pending?.paypalOrderId && pending.paypalOrderId !== orderId) {
        return res.status(400).json({ error: 'PayPal order mismatch. Please refresh the page and try again.' });
      }

      const captureData = await paypalService.captureOrder(orderId);
      const capture = captureData?.purchase_units?.[0]?.payments?.captures?.[0];
      const captureStatus = capture?.status || captureData?.status;

      if (captureStatus && captureStatus !== 'COMPLETED') {
        return res.status(400).json({ error: 'Payment not completed', details: captureStatus });
      }

      const payerEmail = captureData?.payer?.email_address || null;
      const payerId = captureData?.payer?.payer_id || null;
      const paidAmount = toTwoDp(capture?.amount?.value || quote.pricing.total);
      const currency = capture?.amount?.currency_code || quote.pricing.currency;

      const orderSummary = await new Promise((resolve, reject) => {
        Cart.checkout(
          userId,
          {
            voucher_id: pending?.voucherId ?? quote.voucherId ?? null,
            shipping_fee: quote.pricing.shippingFee,
            tax_rate: quote.pricing.taxRate,
            discount_amount: quote.pricing.discountAmount,
            payment_status: 'PAID'
          },
          (checkoutErr, summary) => {
            if (checkoutErr) return reject(checkoutErr);
            return resolve(summary);
          }
        );
      });

      await Payment.recordTransaction({
        order_id: orderSummary?.order_id || null,
        paypal_order_id: orderId,
        payer_id: payerId,
        payer_email: payerEmail,
        amount: paidAmount,
        currency,
        status: captureStatus || 'COMPLETED',
        payment_method: 'PAYPAL'
      });

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

      req.session.pendingPayment = null;
      req.session.appliedVoucher = null;

      return res.json({
        success: true,
        redirectUrl: '/invoice-confirmation'
      });
    } catch (err) {
      console.error('PayPal capture order error:', err);
      const message = err.message || 'Failed to capture PayPal order';
      const status = message.toLowerCase().includes('cart') || message.toLowerCase().includes('stock') ? 400 : 500;
      return res.status(status).json({ error: message });
    }
  },


  async createNetsQr(req, res) {
    const userId = req.session?.user_id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const role = (req.session?.role || req.session?.user?.role || '').toLowerCase();
    const voucherCode = getVoucherCode(req);

    try {
      const quote = await Payment.buildQuote(userId, role, voucherCode);
      const total = toTwoDp(quote.pricing.total);
      if (total <= 0) {
        return res.status(400).json({ error: 'Cart total must be greater than 0.' });
      }

      const qrResponse = await netsService.requestQr({ amount: total });
      const qrData = qrResponse?.qrData || null;
      const qrCodeUrl = normalizeQrCode(qrData);
      const txnRetrievalRef = qrResponse?.txnRetrievalRef || qrData?.txn_retrieval_ref || null;

      if (!qrCodeUrl || !txnRetrievalRef) {
        return res.status(500).json({ error: 'Failed to generate NETS QR. Please try again.' });
      }

      req.session.netsPayment = {
        status: 'PENDING',
        createdAt: Date.now(),
        txnRetrievalRef,
        courseInitId: qrResponse?.courseInitId || null,
        amount: total,
        quote,
        voucherCode: voucherCode || null,
        voucherId: quote.voucherId || null
      };

      req.session.netsQrView = {
        title: 'NETS QR Payment',
        qrCodeUrl,
        total: total.toFixed(2),
        timer: Number(qrData?.time_left || qrData?.qr_expiry_seconds || 300),
        orderExpiryMinutes: 15,
        txnRetrievalRef,
        courseInitId: qrResponse?.courseInitId || null,
        successRedirect: '/nets-qr/success',
        failRedirect: '/nets-qr/fail',
        cancelRedirect: '/cart'
      };

      return res.json({ success: true, redirectUrl: '/nets-qr/scan' });
    } catch (err) {
      console.error('NETS create QR error:', err);
      const message = err.message || 'Unable to start NETS payment.';
      return res.status(500).json({ error: message });
    }
  },

  renderNetsQr(req, res) {
    const viewData = req.session?.netsQrView;
    if (!viewData) {
      if (req.flash) req.flash('error', 'No NETS payment session found.');
      return res.redirect('/cart');
    }
    return res.render('netsQr', viewData);
  },

  async sseNetsStatus(req, res) {
    const userId = req.session?.user_id;
    if (!userId) {
      res.status(401).end();
      return;
    }

    const txnRetrievalRef = req.params?.txnRetrievalRef;
    const pending = req.session?.netsPayment;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const sendEvent = (payload) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    if (!pending || !txnRetrievalRef || pending.txnRetrievalRef !== txnRetrievalRef) {
      sendEvent({ fail: true, message: 'No pending NETS payment.' });
      return res.end();
    }

    if (pending.status === 'COMPLETED') {
      sendEvent({ success: true, message: pending.resultMessage || 'Payment completed.' });
      return res.end();
    }

    if (pending.status === 'FAILED') {
      sendEvent({ fail: true, message: pending.resultMessage || 'Payment failed.' });
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
            const role = (req.session?.role || req.session?.user?.role || '').toLowerCase();
            const quote = await Payment.buildQuote(userId, role, pending.voucherCode || null);
            if (pending?.quote?.pricing?.total !== undefined) {
              const storedTotal = toTwoDp(pending.quote.pricing.total);
              if (storedTotal !== quote.pricing.total) {
                throw new Error('Cart changed after generating NETS QR. Please try again.');
              }
            }

            const orderSummary = await new Promise((resolve, reject) => {
              Cart.checkout(
                userId,
                {
                  voucher_id: pending.voucherId ?? quote.voucherId ?? null,
                  shipping_fee: quote.pricing.shippingFee,
                  tax_rate: quote.pricing.taxRate,
                  discount_amount: quote.pricing.discountAmount,
                  payment_status: 'PAID'
                },
                (checkoutErr, summary) => (checkoutErr ? reject(checkoutErr) : resolve(summary))
              );
            });

            await Payment.recordTransaction({
              order_id: orderSummary?.order_id || null,
              paypal_order_id: pending.txnRetrievalRef,
              payer_id: 'nets_' + userId,
              payer_email: req.session?.user?.email || null,
              amount: toTwoDp(quote.pricing.total),
              currency: quote.pricing.currency,
              status: 'COMPLETED',
              payment_method: 'NETS_QR'
            });

            buildInvoiceSession(req, quote, orderSummary);

            pending.status = 'COMPLETED';
            pending.resultMessage = statusInfo.message || 'Payment completed.';
            req.session.appliedVoucher = null;

            sendEvent({ success: true, message: pending.resultMessage });
            return closeStream();
          } catch (checkoutErr) {
            console.error('NETS finalize error:', checkoutErr);
            pending.status = 'FAILED';
            pending.resultMessage = checkoutErr.message || 'Payment could not be finalized.';
            sendEvent({ fail: true, message: pending.resultMessage });
            return closeStream();
          }
        }

        if (isFailStatus(statusInfo)) {
          pending.status = 'FAILED';
          pending.resultMessage = statusInfo.message || 'Payment failed.';
          sendEvent({ fail: true, message: pending.resultMessage });
          return closeStream();
        }

        sendEvent({ pending: true, status: statusInfo.status || 'PENDING' });
      } catch (err) {
        console.error('NETS status query error:', err);
        sendEvent({ pending: true, status: 'PENDING' });
      }
    };

    await poll();
    interval = setInterval(poll, 3000);
  },

  renderNetsSuccess(req, res) {
    const message = req.session?.netsPayment?.resultMessage || 'Payment completed.';
    return res.render('netsTxnSuccessStatus', { message });
  },

  renderNetsFail(req, res) {
    const message = req.session?.netsPayment?.resultMessage || 'Payment was not completed.';
    const orderId = req.session?.netsPayment?.orderId || null;
    return res.render('netsTxnFailStatus', { message, orderId });
  },

};

module.exports = PaymentController;
