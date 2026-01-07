const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const multer = require('multer');
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
const { checkAuthenticated, checkAuthorised } = require('./middleware');


// -------------------- CONFIG --------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const PORT = 3000;

// -------------------- MIDDLEWARE --------------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session MUST come before flash
app.use(session({
    secret: "yourSecretKey123",
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

// Users
app.get('/users', UserController.listUsers);
app.get('/users/:id', UserController.getUserById);
app.post('/users', UserController.addUser);
app.put('/users/:id', UserController.updateUser);
app.delete('/users/:id', UserController.deleteUser);

// Order items
app.get('/orderItems', OrderItemController.listOrderItems);
app.get('/orderItems/:id', OrderItemController.getOrderItemById);
app.post('/orderItems', OrderItemController.addOrderItem);
app.put('/orderItems/:id', OrderItemController.updateOrderItem);
app.delete('/orderItems/:id', OrderItemController.deleteOrderItem);

// Vouchers (admin CRUD)
app.get('/vouchers', VoucherController.list);
app.get('/vouchers/new', VoucherController.showCreateForm);
app.post('/vouchers', VoucherController.create);
app.get('/vouchers/:id/edit', VoucherController.showEditForm);
app.put('/vouchers/:id', VoucherController.update);
app.delete('/vouchers/:id', VoucherController.delete);
// Apply voucher (user)
app.post('/vouchers/apply', VoucherController.apply);

// Cart
app.get('/cart', checkAuthenticated, checkAuthorised(['customer', 'adopter']), CartController.viewCart);
app.post('/cart', checkAuthenticated, checkAuthorised(['customer', 'adopter']), CartController.addItem);
app.put('/cart/:id', checkAuthenticated, checkAuthorised(['customer', 'adopter']), CartController.updateQuantity);
app.delete('/cart/:id', checkAuthenticated, checkAuthorised(['customer', 'adopter']), CartController.removeItem);
app.delete('/cart', checkAuthenticated, checkAuthorised(['customer', 'adopter']), CartController.clearCart);
app.post('/cart/checkout', checkAuthenticated, checkAuthorised(['customer', 'adopter']), CartController.checkout);

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

// -------------------- START SERVER --------------------
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
