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
const OrderItem = require('./models/OrderItem');
const User = require('./models/User');
const invoiceController = require('./controllers/InvoiceController');
const PaymentController = require('./controllers/PaymentController');
const NetsController = require('./controllers/NetsController');
const netsService = require('./services/Nets');
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

// NETS payment endpoints
app.post('/generateNETSQR', checkAuthenticated, checkAuthorised(['customer', 'adopter']), netsService.generateQrCode);

// SSE endpoint to poll NETS QR transaction status
app.get('/sse/payment-status/:txnRetrievalRef', async (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const txnRetrievalRef = req.params.txnRetrievalRef;
  let pollCount = 0;
  const maxPolls = 60; // 5 minutes if polling every 5s
  let frontendTimeoutStatus = 0;

  const interval = setInterval(async () => {
    pollCount++;

    try {
      // Call the NETS query API
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
      
      // Send the full response to the frontend
      res.write(`data: ${JSON.stringify(data)}\n\n`);

      const resData = data.result && data.result.data;

      // Decide when to end polling and close the connection
      // Check if payment is successful
      if (resData && resData.response_code == '00' && resData.txn_status === 1) {
        // Payment success: send a success message
        console.log('NETS payment successful for txnRef:', txnRetrievalRef);
        res.write(`data: ${JSON.stringify({ success: true })}\n\n`);
        clearInterval(interval);
        res.end();
      } else if (frontendTimeoutStatus == 1 && resData && (resData.response_code !== '00' || resData.txn_status === 2)) {
        // Payment failure: send a fail message
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

    // Timeout after max polls
    if (pollCount >= maxPolls) {
      clearInterval(interval);
      frontendTimeoutStatus = 1;
      console.log('NETS payment polling timeout for txnRef:', txnRetrievalRef);
      res.write(`data: ${JSON.stringify({ fail: true, error: 'Transaction timed out after 5 minutes' })}\n\n`);
      res.end();
    }
  }, 5000); // Poll every 5 seconds

  req.on('close', () => {
    clearInterval(interval);
    console.log('SSE connection closed for txnRef:', txnRetrievalRef);
  });
});

// NETS QR: Success page
app.get('/nets-qr/success', checkAuthenticated, async (req, res) => {
  const txnRetrievalRef = req.query.txn_retrieval_ref;
  console.log('NETS success page - txnRef:', txnRetrievalRef);
  console.log('Session user_id:', req.session.user_id);

  // Skip NETS payment processing if this payment was already processed (browser refresh)
  // Check if we already created an invoice in this session to prevent double-processing
  // Skip NETS payment processing if THIS EXACT TRANSACTION was already processed (browser refresh)
  // Use txn_retrieval_ref to identify the specific transaction, not just a boolean flag
  // This allows multiple different payments in the same session
  if (req.session.lastProcessedTxnRef === txnRetrievalRef && req.session.invoice) {
    console.log('NETS payment txn_ref', txnRetrievalRef, 'already processed, redirecting to invoice');
    return res.redirect('/invoice-confirmation');
  }

  const user = req.session.user || { username: 'guest' };
  const userId = req.session.user_id;

  try {
    const Payment = require('./models/Payment');
    const Cart = require('./models/Cart');
    const { toTwoDp } = Payment;

    // STEP 1: Retrieve full cart with product details BEFORE checkout (checkout deletes cart!)
    console.log('Retrieving cart items before checkout...');
    const cartItemsWithDetails = await new Promise((resolve, reject) => {
      const sql = `
        SELECT c.cart_id, c.product_id, c.quantity, p.product_name, p.price
        FROM cart c
        JOIN products p ON c.product_id = p.product_id
        WHERE c.user_id = ?
        ORDER BY c.cart_id
      `;
      connection.query(sql, [userId], (err, results) => {
        if (err) {
          console.error('Cart retrieval error:', err);
          return reject(err);
        }
        console.log('Raw DB results:', JSON.stringify(results));
        resolve(results || []);
      });
    });

    if (!cartItemsWithDetails || cartItemsWithDetails.length === 0) {
      console.log('Cart is empty, redirecting to shopping');
      req.flash('error', 'Cart is empty');
      return res.redirect('/shopping');
    }

    console.log('Cart items retrieved:', cartItemsWithDetails.length, 'items');
    console.log('Cart details:', JSON.stringify(cartItemsWithDetails));

    // STEP 2: Call checkout to create order (this will delete cart and create order_items)
    console.log('Calling Cart.checkout...');
    
    // Calculate shipping fee based on subtotal (matching cart.ejs logic)
    const cartSubtotal = cartItemsWithDetails.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
    const shippingFee = cartSubtotal >= 60 ? 0 : 5;
    const taxRate = 9; // 9% tax rate (expects percentage, not decimal)
    
    const orderSummary = await new Promise((resolve, reject) => {
      Cart.checkout(
        userId,
        {
          voucher_id: null,
          shipping_fee: shippingFee,
          tax_rate: taxRate,
          discount_amount: 0
        },
        (checkoutErr, summary) => {
          if (checkoutErr) {
            console.error('Checkout error:', checkoutErr);
            return reject(checkoutErr);
          }
          console.log('Checkout successful:', summary);
          return resolve(summary);
        }
      );
    });

    console.log('Order created with ID:', orderSummary.order_id);

    // STEP 3: Record the transaction
    const payerEmail = req.session?.user?.email || null;
    const payerId = 'nets_' + userId;
    const paidAmount = toTwoDp(orderSummary.total_amount || 0);
    const currency = 'SGD';

    await Payment.recordTransaction({
      order_id: orderSummary?.order_id || null,
      paypal_order_id: txnRetrievalRef || 'NETS-' + Date.now(),
      payer_id: payerId,
      payer_email: payerEmail,
      amount: paidAmount,
      currency,
      status: 'COMPLETED',
      payment_method: 'NETS'
    });

    console.log('Transaction recorded');

    // STEP 4: Convert cart items to invoice format (we have them from step 1)
    const invoiceItems = cartItemsWithDetails.map((row) => ({
      id: row.product_id,
      productName: row.product_name,
      quantity: Number(row.quantity) || 0,
      price: Number(row.price) || 0,
      subtotal: toTwoDp(Number(row.price) * Number(row.quantity))
    }));

    console.log('Invoice items prepared:', invoiceItems.length);
    console.log('Invoice items data:', JSON.stringify(invoiceItems));

    // STEP 5: Set up invoice session
    req.session.lastProcessedTxnRef = txnRetrievalRef;
    req.session.invoice = {
      id: `INV-${Date.now()}`,
      user: user.username || user.email || 'guest',
      date: new Date(),
      items: invoiceItems,
      subtotal: toTwoDp(orderSummary.subtotal || 0),
      shippingFee: toTwoDp(orderSummary.shipping_fee || 0),
      taxAmount: toTwoDp(orderSummary.tax_amount || 0),
      discountAmount: toTwoDp(orderSummary.discount_amount || 0),
      total: toTwoDp(orderSummary.total_amount || 0),
      orderId: orderSummary.order_id
    };
    
    console.log('Session invoice created:', JSON.stringify(req.session.invoice));

    req.session.cart = []; // Clear cart

    console.log('NETS invoice created:', req.session.invoice.id);
    console.log('Redirecting to invoice-confirmation');

    // Save session before redirect to ensure invoice persists
    req.session.save((saveErr) => {
      if (saveErr) {
        console.error('Session save error:', saveErr);
        return res.status(500).render('netsTxnFailStatus', { 
          message: 'Payment received but session save failed. Please try again.' 
        });
      }
      console.log('Session saved successfully, redirecting...');
      res.redirect('/invoice-confirmation');
    });
  } catch (stockErr) {
    console.error('Stock check error:', stockErr);
    req.flash('error', 'Payment processed but invoice creation failed: ' + stockErr.message);
    res.render('netsTxnFailStatus', { message: 'Payment received but order processing failed. Please contact support.' });
  }
});

// NETS QR: Failure page
app.get('/nets-qr/fail', checkAuthenticated, (req, res) => {
  const txnRetrievalRef = req.query.txn_retrieval_ref;
  console.log('NETS failure page - txnRef:', txnRetrievalRef);
  res.render('netsTxnFailStatus', { message: 'Transaction Failed. Please try again.' });
});

app.post('/nets/check-payment', checkAuthenticated, (req, res) => {
  console.log('*** /nets/check-payment route hit ***');
  return NetsController.checkPaymentStatus(req, res);
});

app.post('/nets/complete-payment', checkAuthenticated, checkAuthorised(['customer', 'adopter']), (req, res) => {
  console.log('*** /nets/complete-payment route hit ***');
  return NetsController.completePayment(req, res);
});

app.post('/nets/check-transaction', checkAuthenticated, (req, res) => {
  console.log('*** /nets/check-transaction route hit ***');
  return NetsController.checkTransaction(req, res);
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

app.get('/digitalWallet', (req, res) => {
    res.send('Digital wallet page placeholder');
});

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
