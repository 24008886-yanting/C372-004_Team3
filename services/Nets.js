const fetch = require('node-fetch');
require('dotenv').config();

console.log('NETS Service loaded - checking env vars on startup');
console.log('API_KEY exists:', !!process.env.API_KEY);
console.log('PROJECT_ID exists:', !!process.env.PROJECT_ID);

// Generate QR Code
exports.generateQrCode = async (req, res) => {
  const { cartTotal } = req.body;
  console.log('NETS generateQrCode called with cartTotal:', cartTotal);
  
  try {
    const requestBody = {
      txn_id: "sandbox_nets|m|8ff8e5b6-d43e-4786-8ac5-7accf8c5bd9b",
      amt_in_dollars: cartTotal,
      notify_mobile: 0,
    };

    console.log('Sending request to NETS API with body:', requestBody);

    const response = await fetch(
      `https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets-qr/request`,
      {
        method: 'POST',
        headers: {
          'api-key': process.env.API_KEY,
          'project-id': process.env.PROJECT_ID,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }
    );

    const data = await response.json();
    console.log('Full NETS response:', data);

    const qrData = data.result.data;
    console.log('QR Data Response:', qrData);

    if (
      qrData.response_code === '00' &&
      qrData.txn_status === 1 &&
      qrData.qr_code
    ) {
      console.log('QR code generated successfully');
      const txnRetrievalRef = qrData.txn_retrieval_ref;

      console.log('Transaction retrieval ref: ' + txnRetrievalRef);
      console.log('Preserving cart in session for later use');

      res.render('NETSQR', {
        total: cartTotal,
        title: 'Scan to Pay',
        qrCodeUrl: `data:image/png;base64,${qrData.qr_code}`,
        txnRetrievalRef: txnRetrievalRef,
        fullNetsResponse: data,
        apiKey: process.env.API_KEY,
        projectId: process.env.PROJECT_ID,
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
    res.render('netsTxnFailStatus', { 
      title: 'Error', 
      message: 'Failed to generate QR code. Please check server logs.' 
    });
  }
};