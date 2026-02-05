const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const multer = require('multer');
require('dotenv').config();
const app = express();

const ProductController = require('./controllers/ProductController');
const UserController = require('./controllers/UserController');
const OrderController = require('./controllers/OrderController');
const OrderItemController = require('./controllers/OrderItemController');
const CartController = require('./controllers/CartController');
const ReviewController = require('./controllers/ReviewController');
const ContactController = require('./controllers/ContactController');
const ShelterController = require('./controllers/ShelterController');
const AdoptionController = require('./controllers/AdoptionController');
const VoucherController = require('./controllers/VoucherController');
const WishlistController = require('./controllers/WishlistController');
const RefundController = require('./controllers/RefundController');
const OrderItem = require('./models/OrderItem');
const Order = require('./models/Order');
const User = require('./models/User');
const Cart = require('./models/Cart');
const Payment = require('./models/Payment');
const Wallet = require('./models/Wallet');
const { toTwoDp } = Payment;
const invoiceController = require('./controllers/InvoiceController');
const PaymentController = require('./controllers/PaymentController');
const WalletController = require('./controllers/WalletController');
const connection = require('./db');
const { checkAuthenticated, checkAuthorised } = require('./middleware');


// -------------------- CONFIG --------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const PORT = process.env.PORT || 3000;

// -------------------- MIDDLEWARE --------------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session MUST come before flash
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-dev-secret-change-in-production',
    resave: false,
    saveUninitialized: true
}));

app.use(flash());

// Expose session user/role to all views
app.use((req, res, next) => {
    res.locals.currentUser = req.session?.user || null;
    res.locals.currentRole = (req.session?.role || '').toLowerCase();
    next();
});

// -------------------- MULTER --------------------
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage });

// -------------------- ROUTES --------------------
app.get('/', (req, res) => {
    res.render('homepage');
});

// Product views
app.get('/shopping', ProductController.shoppingList);             // customer shopping list
app.get('/product/:id', ProductController.getProductById);        // product detail
app.get('/products/search', ProductController.search);            // live search endpoint
app.get('/inventory', checkAuthenticated, checkAuthorised(['admin']), ProductController.listInventory);           // admin inventory list
app.get('/products/new', checkAuthenticated, checkAuthorised(['admin']), ProductController.showAddForm);          // show add form
app.post('/products/add', checkAuthenticated, checkAuthorised(['admin']), upload.fields([{ name: 'image1', maxCount: 1 }, { name: 'image2', maxCount: 1 }]), ProductController.addProduct);  // add product
app.get('/products/:id/edit', checkAuthenticated, checkAuthorised(['admin']), ProductController.showUpdateForm);  // show update form
app.post('/products/:id/update', checkAuthenticated, checkAuthorised(['admin']), upload.fields([{ name: 'image1', maxCount: 1 }, { name: 'image2', maxCount: 1 }]), ProductController.updateProduct); // update product
app.post('/products/:id/status', checkAuthenticated, checkAuthorised(['admin']), ProductController.updateStatus); // update product status
app.post('/products/:id/delete', checkAuthenticated, checkAuthorised(['admin']), ProductController.deleteProduct); // delete product

// Contact
app.get('/contact', checkAuthenticated, checkAuthorised(['customer', 'adopter', 'shelter']), ContactController.showForm);
app.post('/contact', checkAuthenticated, checkAuthorised(['customer', 'adopter', 'shelter']), ContactController.submitMessage);
app.get('/userContactMessages', checkAuthenticated, checkAuthorised(['customer', 'adopter', 'shelter']), ContactController.viewInbox);
app.get('/admin/messages', checkAuthenticated, checkAuthorised(['admin']), ContactController.viewAllMessages);
app.post('/admin/messages/:id/reply', checkAuthenticated, checkAuthorised(['admin']), ContactController.submitReply);

// Shelter management (admin)
app.get('/shelter', checkAuthenticated, checkAuthorised(['admin']), (req, res) => {
    res.render('shelter');
});
app.get('/addShelter', checkAuthenticated, checkAuthorised(['admin']), (req, res) => {
    res.render('addShelter', { error: null });
});
app.get('/shelterList', checkAuthenticated, checkAuthorised(['admin']), ShelterController.listShelters);
app.get('/shelter/:id', checkAuthenticated, checkAuthorised(['admin']), ShelterController.getShelterById);
app.post('/shelter', checkAuthenticated, checkAuthorised(['admin']), ShelterController.addShelter);
app.post('/shelter/:id/update', checkAuthenticated, checkAuthorised(['admin']), ShelterController.updateShelter);
app.post('/shelter/:id/delete', checkAuthenticated, checkAuthorised(['admin']), ShelterController.deleteShelter);

// Adoption management (shelter)
app.get('/addAdopter', checkAuthenticated, checkAuthorised(['shelter']), AdoptionController.showAddForm);
app.post('/addAdopter', checkAuthenticated, checkAuthorised(['shelter']), AdoptionController.addAdoption);
app.get('/adoptedList', checkAuthenticated, checkAuthorised(['shelter']), AdoptionController.listAdoptions);

// Auth
app.get('/login', (req, res) => {
    const success = (req.flash && req.flash('success')[0]) || undefined;
    const error = (req.flash && req.flash('error')[0]) || undefined;
    res.render('login', { success, error, email: '' });
});
app.post('/login', UserController.login);
app.get('/register', UserController.renderRegister);
app.post('/register', UserController.register);
app.get('/logout', UserController.logout);
app.get('/forgot-password', UserController.renderForgotPassword);
app.post('/forgot-password', UserController.resetPassword);

// Users
app.get('/users', UserController.listUsers);
app.get('/users/:id', UserController.getUserById);
app.post('/users', UserController.addUser);
app.put('/users/:id', UserController.updateUser);
app.delete('/users/:id', UserController.deleteUser);

// Admin manage users
app.get('/manageUsers', checkAuthenticated, checkAuthorised(['admin']), UserController.showManageUsersPage);
app.post('/manageUsers/add', checkAuthenticated, checkAuthorised(['admin']), UserController.addUserAdmin);
app.post('/manageUsers/:userId/update', checkAuthenticated, checkAuthorised(['admin']), UserController.updateUserAdmin);
app.post('/manageUsers/:userId/delete', checkAuthenticated, checkAuthorised(['admin']), UserController.deleteUserAdmin);

// Order items
app.get('/orderItems', OrderItemController.listOrderItems);
app.get('/orderItems/:id', OrderItemController.getOrderItemById);
app.post('/orderItems', OrderItemController.addOrderItem);
app.put('/orderItems/:id', OrderItemController.updateOrderItem);
app.delete('/orderItems/:id', OrderItemController.deleteOrderItem);

// Vouchers (admin CRUD)
app.get('/vouchers', checkAuthenticated, checkAuthorised(['admin']), VoucherController.list);
app.get('/vouchers/new', checkAuthenticated, checkAuthorised(['admin']), VoucherController.showCreateForm);
app.post('/vouchers', checkAuthenticated, checkAuthorised(['admin']), VoucherController.create);
// Apply voucher (user)
app.post('/vouchers/apply', VoucherController.apply);
app.get('/vouchers/:id/edit', checkAuthenticated, checkAuthorised(['admin']), VoucherController.showEditForm);
app.post('/vouchers/:id', checkAuthenticated, checkAuthorised(['admin']), VoucherController.update);
app.post('/vouchers/:id/delete', checkAuthenticated, checkAuthorised(['admin']), VoucherController.delete);
app.put('/vouchers/:id', checkAuthenticated, checkAuthorised(['admin']), VoucherController.update);
app.delete('/vouchers/:id', checkAuthenticated, checkAuthorised(['admin']), VoucherController.delete);

// Orders dashboard (admin)
app.get('/orderDashboard', checkAuthenticated, checkAuthorised(['admin']), OrderController.listDashboard);
app.get('/refund-requests', checkAuthenticated, checkAuthorised(['admin']), RefundController.listAll);
app.post('/refund-requests/:id/approve', checkAuthenticated, checkAuthorised(['admin']), RefundController.approve);
app.post('/refund-requests/:id/reject', checkAuthenticated, checkAuthorised(['admin']), RefundController.reject);

// Cart
app.get('/cart', checkAuthenticated, checkAuthorised(['customer', 'adopter']), CartController.viewCart);
app.post('/cart', checkAuthenticated, checkAuthorised(['customer', 'adopter']), CartController.addItem);
app.put('/cart/:id', checkAuthenticated, checkAuthorised(['customer', 'adopter']), CartController.updateQuantity);
app.delete('/cart/:id', checkAuthenticated, checkAuthorised(['customer', 'adopter']), CartController.removeItem);
app.delete('/cart', checkAuthenticated, checkAuthorised(['customer', 'adopter']), CartController.clearCart);
app.post('/cart/checkout', checkAuthenticated, checkAuthorised(['customer', 'adopter']), (req, res) => {
    invoiceController.processInvoice(req, res);
});
// PayPal payment endpoints
app.post('/paypal/create-order', checkAuthenticated, checkAuthorised(['customer', 'adopter']), PaymentController.createPaypalOrder);
app.post('/paypal/capture-order', checkAuthenticated, checkAuthorised(['customer', 'adopter']), PaymentController.capturePaypalOrder);

// NETS QR payment endpoint
app.post('/generateNETSQR', checkAuthenticated, checkAuthorised(['customer', 'adopter']), PaymentController.generateNetsQrCode);

// SSE endpoint to poll NETS QR transaction status
app.get('/sse/payment-status/:txnRetrievalRef', async (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const txnRetrievalRef = req.params.txnRetrievalRef;
  let pollCount = 0;
  const maxPolls = 60;
  let frontendTimeoutStatus = 0;

  const interval = setInterval(async () => {
    pollCount++;

    try {
      const response = await fetch(
        `https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets-qr/query`,
        {
          method: 'POST',
          headers: {
            'api-key': process.env.API_KEY,
            'project-id': process.env.PROJECT_ID,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            txn_retrieval_ref: txnRetrievalRef,
            frontend_timeout_status: frontendTimeoutStatus
          })
        }
      );

      const data = await response.json();
      console.log('NETS polling response (poll #' + pollCount + '):', data);
      
      res.write(`data: ${JSON.stringify(data)}\n\n`);

      const resData = data.result && data.result.data;

      if (resData && resData.response_code == '00' && resData.txn_status === 1) {
        console.log('NETS payment successful for txnRef:', txnRetrievalRef);
        res.write(`data: ${JSON.stringify({ success: true })}\n\n`);
        clearInterval(interval);
        res.end();
      } else if (frontendTimeoutStatus == 1 && resData && (resData.response_code !== '00' || resData.txn_status === 2)) {
        console.log('NETS payment failed for txnRef:', txnRetrievalRef);
        res.write(`data: ${JSON.stringify({ fail: true, ...resData })}\n\n`);
        clearInterval(interval);
        res.end();
      }
    } catch (err) {
      console.error('NETS polling error:', err.message);
      clearInterval(interval);
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }

    if (pollCount >= maxPolls) {
      clearInterval(interval);
      frontendTimeoutStatus = 1;
      console.log('NETS payment polling timeout for txnRef:', txnRetrievalRef);
      res.write(`data: ${JSON.stringify({ fail: true, error: 'Transaction timed out after 5 minutes' })}\n\n`);
      res.end();
    }
  }, 5000);

  req.on('close', () => {
    clearInterval(interval);
    console.log('SSE connection closed for txnRef:', txnRetrievalRef);
  });
});

// NETS QR: Success page
app.get('/nets-qr/success', async (req, res) => {
  try {
    if (!req.session || !req.session.user || !req.session.user_id) {
      return res.render('transactionFail', {
        message: 'You must be logged in to complete a payment. Please log in and try again.',
        returnUrl: '/login'
      });
    }

    const user = req.session.user || { username: 'guest' };
    const userId = req.session.user_id;
    const role = (req.session?.role || req.session?.user?.role || '').toLowerCase();
    const voucherCode = (req.session?.netsVoucher || '').trim();
    const pendingPayment = req.session?.pendingPayment || {};

    if (pendingPayment.purpose === 'wallet-topup') {
      const topupAmount = toTwoDp(pendingPayment.walletTopupAmount || 0);
      if (!topupAmount || topupAmount <= 0) {
        return res.render('transactionFail', {
          message: 'Invalid wallet top-up amount. Please try again.',
          returnUrl: '/digitalWallet'
        });
      }

      await Wallet.credit(
        userId,
        topupAmount,
        {
          txnType: 'TOPUP',
          referenceType: 'NETS_TOPUP',
          referenceId: req.query.txn_retrieval_ref || pendingPayment.netsQrTxnRef || null,
          paymentMethod: 'NETS QR',
          description: 'Wallet top-up via NETS QR'
        },
        { connection: connection, manageTransaction: true }
      );

      let topupOrderId = null;
      if (WalletController.createTopupOrder) {
        topupOrderId = await WalletController.createTopupOrder(userId, topupAmount).catch(() => null);
      }

      await Payment.recordTransaction({
        order_id: topupOrderId,
        paypal_order_id: req.query.txn_retrieval_ref || pendingPayment.netsQrTxnRef || 'NETS-' + Date.now(),
        payer_id: 'nets_' + userId,
        payer_email: user.email || null,
        amount: topupAmount,
        currency: 'SGD',
        status: 'COMPLETED',
        payment_method: 'WALLET_TOPUP_NETS'
      });

      req.session.pendingPayment = null;
      return res.redirect('/digitalWallet');
    }

    // Build quote to get cart items and calculate total
    const quote = await Payment.buildQuote(userId, role, voucherCode);

    // Create invoice
    const invoice = {
      id: `INV-${Date.now()}`,
      user: user.username || user.email || 'guest',
      date: new Date(),
      items: quote.items.map((item) => ({
        productName: item.productName,
        quantity: item.quantity,
        price: item.price,
        subtotal: item.subtotal
      })),
      subtotal: toTwoDp(quote.pricing.subtotal),
      shippingFee: toTwoDp(quote.pricing.shippingFee),
      taxAmount: toTwoDp(quote.pricing.taxAmount),
      discountAmount: toTwoDp(quote.pricing.discountAmount),
      total: toTwoDp(quote.pricing.total)
    };

    // Checkout (deduct stock, create order)
    const orderSummary = await new Promise((resolve, reject) => {
      Cart.checkout(
        userId,
        {
          voucher_id: quote.voucherId ?? null,
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

    // Record transaction
    await Payment.recordTransaction({
      order_id: orderSummary?.order_id || null,
      paypal_order_id: req.query.txn_retrieval_ref || 'NETS-' + Date.now(),
      payer_id: 'nets_' + userId,
      payer_email: user.email || null,
      amount: toTwoDp(invoice.total),
      currency: 'SGD',
      status: 'COMPLETED',
      payment_method: 'NETS QR'
    });

    // Store invoice in session
    req.session.invoice = invoice;
    req.session.netsVoucher = null;
    req.session.pendingPayment = null;
    req.session.appliedVoucher = null;

    // Redirect to invoice page
    return res.redirect('/invoice-confirmation');
  } catch (error) {
    console.error('NETS success handler error:', error);
    return res.render('transactionFail', {
      message: 'Payment processing failed: ' + error.message,
      returnUrl: '/shopping'
    });
  }
});

// NETS QR: Failure page
app.get('/nets-qr/fail', (req, res) => {
  const pendingPayment = req.session?.pendingPayment || {};
  const isWalletTopup = pendingPayment.purpose === 'wallet-topup';
      req.session.pendingPayment = null;
      req.session.appliedVoucher = null;

  res.render('transactionFail', {
    message: 'NETS QR Transaction Failed. Please try another payment method.',
    returnUrl: isWalletTopup ? '/digitalWallet' : '/cart'
  });
});

// Transaction Success page (simplified)
app.get('/transaction-success', (req, res) => {
  res.render('transactionSuccess');
});

// Transaction Fail page (simplified)
app.get('/transaction-fail', (req, res) => {
  res.render('transactionFail', {
    message: req.query.message || 'Transaction Failed. Please try again.',
    returnUrl: req.query.returnUrl || '/cart'
  });
});

// Wishlist
app.get('/wishlist', checkAuthenticated, checkAuthorised(['customer', 'adopter']), WishlistController.view);
app.post('/wishlist', checkAuthenticated, checkAuthorised(['customer', 'adopter']), WishlistController.add);
app.delete('/wishlist/:id', checkAuthenticated, checkAuthorised(['customer', 'adopter']), WishlistController.remove);
app.post('/wishlist/move-from-cart/:id', checkAuthenticated, checkAuthorised(['customer', 'adopter']), WishlistController.moveFromCart);
app.post('/wishlist/:id/move-to-cart', checkAuthenticated, checkAuthorised(['customer', 'adopter']), WishlistController.moveToCart);

// Show new review form (from transactions)
app.get('/reviews/new', checkAuthenticated, ReviewController.showAddForm);

// Create review
app.post('/reviews', checkAuthenticated, ReviewController.create);

// User's reviews list
app.get('/reviewList', checkAuthenticated, ReviewController.listByUser);
app.get('/reviews/admin', checkAuthenticated, checkAuthorised(['admin']), ReviewController.listAll);


// Profile
app.get('/profile', checkAuthenticated, (req, res) => {
    res.render('profile', {
        user: {},
        preferences: [],
        wallet: {},
        vouchers: [],
        transactions: []
    });
});

// Profile sub-pages
app.get('/accountDetails', UserController.renderAccountDetails);
app.post('/accountDetails', UserController.updateAccountDetails);

app.get('/digitalWallet', checkAuthenticated, WalletController.viewWallet);
app.post('/wallet/paypal/create-order', checkAuthenticated, WalletController.createPaypalTopupOrder);
app.post('/wallet/paypal/capture-order', checkAuthenticated, WalletController.capturePaypalTopup);
app.post('/wallet/nets/qr', checkAuthenticated, WalletController.generateNetsTopup);
app.post('/wallet/pay-cart', checkAuthenticated, checkAuthorised(['customer', 'adopter']), WalletController.payWithWallet);

app.get('/myVoucher', VoucherController.viewMine);

// Alias with plural path
app.get('/allTransactions', checkAuthenticated, (req, res) => {
    const userId = req.session?.user_id;
    if (!userId) {
        return res.redirect('/login');
    }

    OrderItem.getByUser(userId, (err, transactions) => {
        if (err) {
            console.error('Failed to load transactions:', err);
            return res.status(500).render('allTransaction', {
                transactions: [],
                error: 'Failed to load transactions. Please try again.'
            });
        }

        res.render('allTransaction', {
            transactions: transactions || []
        });
    });
});

// Confirm delivery (no refund)
app.post('/orders/:orderId/confirm-delivery', checkAuthenticated, checkAuthorised(['customer', 'adopter']), (req, res) => {
    const userId = req.session?.user_id;
    const orderId = Number(req.params?.orderId || 0);
    if (!userId || !orderId) {
        return res.status(400).json({ error: 'Invalid order.' });
    }

    Order.setDeliveryStatus(orderId, userId, 'COMPLETED', (err, result) => {
        if (err) {
            console.error('Failed to confirm delivery:', err);
            return res.status(500).json({ error: 'Failed to confirm delivery.' });
        }
        if (!result || result.affectedRows === 0) {
            return res.status(404).json({ error: 'Order not found.' });
        }
        return res.json({ success: true });
    });
});

// Refund request (customer/adopter)
app.get('/refund-request', checkAuthenticated, checkAuthorised(['customer', 'adopter']), RefundController.showRequestForm);
app.post('/refund-request', checkAuthenticated, checkAuthorised(['customer', 'adopter']), RefundController.submitRequest);


// Admin Setup (for initial admin account creation)
app.get('/admin/setup', (req, res) => {
    const success = (req.flash && req.flash('success')[0]) || undefined;
    const error = (req.flash && req.flash('error')[0]) || undefined;
    res.render('adminSetup', { success, error });
});

app.post('/admin/setup', (req, res) => {
    const { username, email, password, confirmPassword } = req.body;

    // Validation
    if (!username || !email || !password || !confirmPassword) {
        if (req.flash) req.flash('error', 'All fields are required.');
        return res.redirect('/admin/setup');
    }

    if (password !== confirmPassword) {
        if (req.flash) req.flash('error', 'Passwords do not match.');
        return res.redirect('/admin/setup');
    }

    if (password.length < 6) {
        if (req.flash) req.flash('error', 'Password must be at least 6 characters long.');
        return res.redirect('/admin/setup');
    }

    // Create admin account using User model
    const adminData = {
        username,
        email,
        password,
        phone: '',
        address: '',
        role: 'admin'
    };

    User.addUser(adminData, (err, result) => {
        if (err) {
            console.error('Admin setup error:', err);
            if (req.flash) req.flash('error', err.message || 'Failed to create admin account.');
            return res.redirect('/admin/setup');
        }

        if (req.flash) req.flash('success', 'Admin account created successfully! Please login.');
        res.redirect('/login');
    });
});
// Checkout and Invoice Routes
app.get('/checkout', checkAuthenticated, checkAuthorised(['customer', 'adopter']), (req, res) => {
    const cart = req.session.cart || [];
    if (cart.length === 0) {
        req.flash('error', 'Your cart is empty');
        return res.redirect('/shopping');
    }
    res.render('invoice', { cart, user: req.session.user, cartCount: (req.session.cart || []).reduce((s, i) => s + (i.quantity || 0), 0) });
});

app.post('/process-payment', checkAuthenticated, checkAuthorised(['customer', 'adopter']), (req, res) => {
    invoiceController.processInvoice(req, res);
});

app.get('/invoice-confirmation', checkAuthenticated, (req, res) => {
    invoiceController.viewInvoice(req, res);
});
// -------------------- START SERVER --------------------
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
