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
app.get('/accountDetails', (req, res) => {
    res.send('Account details page placeholder');
});

app.get('/digitalWallet', (req, res) => {
    res.send('Digital wallet page placeholder');
});

app.get('/myVoucher', (req, res) => {
    res.send('My voucher page placeholder');
});

app.get('/allTransactions', (req, res) => {
    res.send('All transactions page placeholder');
});






// -------------------- START SERVER --------------------
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
