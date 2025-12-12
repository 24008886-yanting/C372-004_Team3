const Product = require('../models/Product');

const ProductController = {
    // List all products on the inventory page (admin view)
    listInventory(req, res) {
        Product.getAllProducts((err, products) => {
            if (err) {
                req.flash('error', 'Failed to load inventory.');
                return res.redirect('back');
            }
            res.render('inventory', { products });
        });
    },

    // List all products on the shopping page (customer view)
    shoppingList(req, res) {
        Product.getAllProducts((err, products) => {
            if (err) {
                req.flash('error', 'Failed to load products.');
                return res.redirect('/');
            }
            res.render('shopping', { products });
        });
    },

    // Get a single product by ID and render product page
    getProductById(req, res) {
        const productId = req.params.id;
        Product.getProductById(productId, (err, results) => {
            if (err) {
                req.flash('error', 'Error retrieving product.');
                return res.redirect('back');
            }
            const product = results && results[0];
            if (!product) {
                req.flash('error', 'Product not found.');
                return res.redirect('/shopping');
            }
            res.render('product', { product });
        });
    },

    // Render add-product form (admin only)
    showAddForm(req, res) {
        if (req.session?.role !== 'admin') {
            req.flash('error', 'Unauthorized: admin role required.');
            return res.redirect('back');
        }
        res.render('addProduct');
    },

    // Add a new product (admin only)
    addProduct(req, res) {
        const role = req.session?.role;
        if (role !== 'admin') {
            req.flash('error', 'Unauthorized: admin role required.');
            return res.redirect('back');
        }

        const product = {
            product_name: req.body.product_name,
            description: req.body.description,
            ingredient_list: req.body.ingredient_list,
            price: req.body.price,
            stock: req.body.stock,
            category: req.body.category,
            image1: req.body.image1,
            image2: req.body.image2
        };

        Product.addProduct(product, role, (err, result) => {
            if (err) {
                req.flash('error', 'Failed to add product.');
                return res.redirect('back');
            }
            req.flash('success', 'Product added successfully.');
            res.redirect('/inventory');
        });
    },

    // Render update-product form with existing data (admin only)
    showUpdateForm(req, res) {
        if (req.session?.role !== 'admin') {
            req.flash('error', 'Unauthorized: admin role required.');
            return res.redirect('back');
        }

        const productId = req.params.id;
        Product.getProductById(productId, (err, results) => {
            if (err) {
                req.flash('error', 'Error retrieving product.');
                return res.redirect('back');
            }
            const product = results && results[0];
            if (!product) {
                req.flash('error', 'Product not found.');
                return res.redirect('back');
            }
            res.render('updateProduct', { product });
        });
    },

    // Update a product (admin only)
    updateProduct(req, res) {
        const role = req.session?.role;
        if (role !== 'admin') {
            req.flash('error', 'Unauthorized: admin role required.');
            return res.redirect('back');
        }

        const productId = req.params.id;
        const product = {
            product_name: req.body.product_name,
            description: req.body.description,
            ingredient_list: req.body.ingredient_list,
            price: req.body.price,
            stock: req.body.stock,
            category: req.body.category,
            image1: req.body.image1,
            image2: req.body.image2
        };

        Product.updateProduct(productId, product, role, (err) => {
            if (err) {
                req.flash('error', 'Failed to update product.');
                return res.redirect('back');
            }
            req.flash('success', 'Product updated successfully.');
            res.redirect('/inventory');
        });
    },

    // Delete a product (admin only)
    deleteProduct(req, res) {
        const role = req.session?.role;
        if (role !== 'admin') {
            req.flash('error', 'Unauthorized: admin role required.');
            return res.redirect('back');
        }

        const productId = req.params.id;
        Product.deleteProduct(productId, role, (err) => {
            if (err) {
                req.flash('error', 'Failed to delete product.');
                return res.redirect('back');
            }
            req.flash('success', 'Product deleted successfully.');
            res.redirect('/inventory');
        });
    }
};

module.exports = ProductController;
