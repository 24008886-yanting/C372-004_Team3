const paypalService = require('../services/paypal');
const netsService = require('../services/Nets');
const Cart = require('../models/Cart');
const Payment = require('../models/Payment');
const { toTwoDp } = Payment;

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
            discount_amount: quote.pricing.discountAmount
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

  async generateNetsQrCode(req, res) {
    console.log('=== PaymentController.generateNetsQrCode called ===');
    try {
      await netsService.generateQrCode(req, res);
    } catch (error) {
      console.error('PaymentController NETS error:', error);
      res.status(500).json({ error: 'Failed to generate NETS QR code: ' + error.message });
    }
  }
};

module.exports = PaymentController;
