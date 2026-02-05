const axios = require('axios');
const Payment = require('../models/Payment');
const { toTwoDp } = Payment;
require('dotenv').config();

console.log('NETS Service loaded - checking env vars on startup');
console.log('API_KEY exists:', !!process.env.API_KEY);
console.log('PROJECT_ID exists:', !!process.env.PROJECT_ID);

// Generate QR Code
exports.generateQrCode = async (req, res) => {
  const userId = req.session?.user_id;
  if (!userId) {
    return res.render('transactionFail', {
      message: 'You must be logged in to complete a payment. Please log in and try again.',
      returnUrl: '/login'
    });
  }

  const role = (req.session?.role || req.session?.user?.role || '').toLowerCase();
  const voucherCode = (req.body?.voucher_code || '').trim();
  const cartTotal = req.body?.cartTotal || '0.00';
  const isWalletTopup =
    req.body?.walletTopup === '1' ||
    req.body?.walletTopup === true ||
    String(req.body?.walletTopup || '').toLowerCase() === 'true' ||
    req.body?.context === 'wallet';
  
  console.log('NETS generateQrCode called for user:', userId, 'role:', role, 'cartTotal:', cartTotal);
  
  try {
    // Build quote to get cart total with voucher applied (if provided via form)
    // Otherwise use the cartTotal sent from the form
    let finalTotal = parseFloat(cartTotal);
    
    if (!isWalletTopup && voucherCode) {
      try {
        const quote = await Payment.buildQuote(userId, role, voucherCode);
        finalTotal = toTwoDp(quote.pricing.total);
        console.log('Quote built with voucher - total:', finalTotal);
      } catch (quoteErr) {
        console.warn('Could not build quote with voucher, using form total:', finalTotal);
      }
    }

    const requestBody = {
      txn_id: "sandbox_nets|m|8ff8e5b6-d43e-4786-8ac5-7accf8c5bd9b",
      amt_in_dollars: finalTotal,
      notify_mobile: 0,
    };

    console.log('Sending request to NETS API with body:', requestBody);

    const response = await axios.post(
      `https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets-qr/request`,
      requestBody,
      {
        headers: {
          'api-key': process.env.API_KEY,
          'project-id': process.env.PROJECT_ID,
        },
      }
    );

    const qrData = response.data.result.data;
    console.log('QR Data Response:', qrData);

    if (
      qrData.response_code === '00' &&
      qrData.txn_status === 1 &&
      qrData.qr_code
    ) {
      console.log('QR code generated successfully');
      const txnRetrievalRef = qrData.txn_retrieval_ref;

      console.log('Transaction retrieval ref: ' + txnRetrievalRef);

      // Store pending payment in session
      req.session.pendingPayment = {
        netsQrTxnRef: txnRetrievalRef,
        voucherCode: isWalletTopup ? null : (voucherCode || null),
        quote: { pricing: { total: finalTotal } },
        purpose: isWalletTopup ? 'wallet-topup' : 'cart',
        walletTopupAmount: isWalletTopup ? finalTotal : null
      };
      req.session.netsVoucher = isWalletTopup ? null : voucherCode || null;

      res.render('NETSQR', {
        total: finalTotal,
        title: 'Scan to Pay',
        qrCodeUrl: `data:image/png;base64,${qrData.qr_code}`,
        txnRetrievalRef: txnRetrievalRef,
        fullNetsResponse: response.data,
        apiKey: process.env.API_KEY,
        projectId: process.env.PROJECT_ID,
        cancelUrl: isWalletTopup ? '/digitalWallet' : '/cart'
      });
    } else {
      let errorMsg = 'An error occurred while generating the QR code.';
      if (qrData && qrData.network_status !== 0) {
        errorMsg = qrData.error_message || 'Transaction failed. Please try again.';
      }
      console.error('QR generation failed - qrData:', qrData);
      res.render('netsTxnFailStatus', {
        title: 'Error',
        message: errorMsg,
      });
    }
  } catch (error) {
    console.error('Error in generateQrCode:', error.message);
    console.error('Full error:', error);
    const message = error.message || 'Failed to generate QR code. Please check server logs.';
    const status = message.toLowerCase().includes('empty') || message.toLowerCase().includes('stock') ? 400 : 500;
    
    if (status === 400) {
      return res.render('transactionFail', {
        message: message,
        returnUrl: '/cart'
      });
    }
    
    res.render('netsTxnFailStatus', { 
      title: 'Error', 
      message: message
    });
  }
};
