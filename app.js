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
const VoucherController = require('./controllers/VoucherController');
const WishlistController = require('./controllers/WishlistController');

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

// Contact
app.get('/contact', ContactController.showForm);
app.post('/contact', ContactController.submitMessage);

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
app.get('/cart', CartController.viewCart);
app.post('/cart', CartController.addItem);
app.put('/cart/:id', CartController.updateQuantity);
app.delete('/cart/:id', CartController.removeItem);
app.delete('/cart', CartController.clearCart);
app.post('/cart/checkout', CartController.checkout);

// Wishlist
app.get('/wishlist', WishlistController.view);
app.post('/wishlist', WishlistController.add);
app.delete('/wishlist/:id', WishlistController.remove);
app.post('/wishlist/move-from-cart/:id', WishlistController.moveFromCart);
app.post('/wishlist/:id/move-to-cart', WishlistController.moveToCart);

// Profile
app.get('/profile', (req, res) => {
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

app.get('/myVoucher', (req, res) => {
    res.send('My voucher page placeholder');
});

// Alias with plural path
app.get('/allTransactions', (req, res) => {
    res.render('allTransaction', {
        transactions: []
    });
});


// -------------------- START SERVER --------------------
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
