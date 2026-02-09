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
const AdminReportController = require('./controllers/AdminReportController');
const OrderItem = require('./models/OrderItem');
const Order = require('./models/Order');
const User = require('./models/User');
const Cart = require('./models/Cart');
const Payment = require('./models/Payment');
const Wallet = require('./models/Wallet');
const { toTwoDp } = Payment;
const PaymentController = require('./controllers/PaymentController');
const WalletController = require('./controllers/WalletController');
const RiskFlagController = require('./controllers/RiskFlagController');
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

// Ensure order tracking table exists.
Order.ensureTrackingTable();

// -------------------- ROUTES --------------------
app.get('/', (req, res) => {
    const success = (req.flash && req.flash('login_success')[0]) || undefined;
    res.render('homepage', { success });
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
app.get('/orders/tracking', checkAuthenticated, checkAuthorised(['customer', 'adopter']), OrderController.listTracking);
app.get('/admin/reports/sales', checkAuthenticated, checkAuthorised(['admin']), AdminReportController.salesReport);
app.get('/admin/refunds', checkAuthenticated, checkAuthorised(['admin']), RefundController.listAll);
app.get('/refund-requests/:id', checkAuthenticated, checkAuthorised(['admin']), RefundController.showAdminDetail);
app.post('/refund-requests/:id/approve', checkAuthenticated, checkAuthorised(['admin']), RefundController.approve);
app.post('/refund-requests/:id/reject', checkAuthenticated, checkAuthorised(['admin']), RefundController.reject);

// Cart
app.get('/cart', checkAuthenticated, checkAuthorised(['customer', 'adopter']), CartController.viewCart);
app.post('/cart', checkAuthenticated, checkAuthorised(['customer', 'adopter']), CartController.addItem);
app.put('/cart/:id', checkAuthenticated, checkAuthorised(['customer', 'adopter']), CartController.updateQuantity);
app.delete('/cart/:id', checkAuthenticated, checkAuthorised(['customer', 'adopter']), CartController.removeItem);
app.delete('/cart', checkAuthenticated, checkAuthorised(['customer', 'adopter']), CartController.clearCart);
app.post('/cart/checkout', checkAuthenticated, checkAuthorised(['customer', 'adopter']), (req, res) => {
    PaymentController.processInvoice(req, res);
});
// PayPal payment endpoints
app.post('/paypal/create-order', checkAuthenticated, checkAuthorised(['customer', 'adopter']), PaymentController.createPaypalOrder);
app.post('/paypal/capture-order', checkAuthenticated, checkAuthorised(['customer', 'adopter']), PaymentController.capturePaypalOrder);

// NETS QR payment endpoints
app.post('/nets-qr/create', checkAuthenticated, checkAuthorised(['customer', 'adopter']), PaymentController.createNetsQr);
app.get('/nets-qr/scan', checkAuthenticated, checkAuthorised(['customer', 'adopter']), PaymentController.renderNetsQr);
app.get('/nets-qr/success', checkAuthenticated, checkAuthorised(['customer', 'adopter']), PaymentController.renderNetsSuccess);
app.get('/nets-qr/fail', checkAuthenticated, checkAuthorised(['customer', 'adopter']), PaymentController.renderNetsFail);
app.get('/sse/nets/payment-status/:txnRetrievalRef', checkAuthenticated, checkAuthorised(['customer', 'adopter']), PaymentController.sseNetsStatus);

// Wishlist
app.get('/wishlist', checkAuthenticated, checkAuthorised(['customer', 'adopter']), WishlistController.view);
app.post('/wishlist', checkAuthenticated, checkAuthorised(['customer', 'adopter']), WishlistController.add);
app.delete('/wishlist/:id', checkAuthenticated, checkAuthorised(['customer', 'adopter']), WishlistController.remove);
app.post('/wishlist/move-from-cart/:id', checkAuthenticated, checkAuthorised(['customer', 'adopter']), WishlistController.moveFromCart);
app.post('/wishlist/:id/move-to-cart', checkAuthenticated, checkAuthorised(['customer', 'adopter']), WishlistController.moveToCart);

// Reviews (user)
app.get('/review/new/:orderId/:productId', checkAuthenticated, ReviewController.showReviewForm);
app.post('/review/new/:orderId/:productId', checkAuthenticated, ReviewController.createReview);
// Backward-compatible routes (expects order_id in query/body; otherwise redirects)
app.get('/review/new/:productId', checkAuthenticated, ReviewController.showReviewForm);
app.post('/review/new/:productId', checkAuthenticated, ReviewController.createReview);

// User's reviews list (optional view)
app.get('/reviewList', checkAuthenticated, ReviewController.listByUser);

// Reviews (admin)
app.get('/admin/reviews', checkAuthenticated, ReviewController.listAll);
app.post('/admin/reviews/delete/:reviewId', checkAuthenticated, ReviewController.deleteReview);

app.get('/admin/risk-flags', checkAuthenticated, checkAuthorised(['admin']), RiskFlagController.listAll);

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

// NETS QR wallet top-up
app.post('/wallet/nets/create', checkAuthenticated, WalletController.createNetsTopup);
app.get('/wallet/nets/scan', checkAuthenticated, WalletController.renderNetsTopupQr);
app.get('/wallet/nets/fail', checkAuthenticated, WalletController.renderNetsTopupFail);
app.get('/sse/nets/wallet-status/:txnRetrievalRef', checkAuthenticated, WalletController.sseNetsTopupStatus);

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

        const orderMap = new Map();
        const grouped = [];
        (transactions || []).forEach((row) => {
            const orderId = row.order_id;
            if (!orderMap.has(orderId)) {
                const order = {
                order_id: orderId,
                transaction_time: row.transaction_time || null,
                amount: row.amount ?? null,
                refund_amount: row.refund_amount ?? null,
                refund_id: row.refund_id ?? null,
                delivery_status: row.delivery_status || '',
                refund_status: row.refund_status || '',
                items: []
            };
                orderMap.set(orderId, order);
                grouped.push(order);
            }
            const order = orderMap.get(orderId);
            if (!order.transaction_time && row.transaction_time) order.transaction_time = row.transaction_time;
            if (order.amount == null && row.amount != null) order.amount = row.amount;
            if (order.refund_amount == null && row.refund_amount != null) order.refund_amount = row.refund_amount;
            if (order.refund_id == null && row.refund_id != null) order.refund_id = row.refund_id;
            if (!order.delivery_status && row.delivery_status) order.delivery_status = row.delivery_status;
            if (!order.refund_status && row.refund_status) order.refund_status = row.refund_status;

            order.items.push({
                order_item_id: row.order_item_id,
                product_id: row.product_id,
                name: row.name || row.product_name || 'Item',
                quantity: row.quantity,
                review_id: row.review_id
            });
        });

        res.render('allTransaction', {
            transactions: grouped
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

    const requested = String(req.body?.status || 'COMPLETED').toUpperCase();
    const nextStatus = requested === 'CONFIRMED' ? 'CONFIRMED' : 'COMPLETED';

    Order.setDeliveryStatus(orderId, userId, nextStatus, (err, result) => {
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
    PaymentController.processInvoice(req, res);
});

app.get('/invoice-confirmation', checkAuthenticated, (req, res) => {
    PaymentController.viewInvoice(req, res);
});


// -------------------- START SERVER --------------------
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
