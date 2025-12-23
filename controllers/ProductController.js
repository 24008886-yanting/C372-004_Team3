const Product = require('../models/Product');

const ProductController = {
    // List all products on the inventory page (admin view)
    listInventory(req, res) {
        Product.getAllProducts((err, products) => {
            if (err) {
                console.error('Failed to load inventory:', err);
                return res.status(500).send('Failed to load inventory.');
            }
            res.render('inventory', { products });
        });
    },

    // List all products on the shopping page (customer view)
    shoppingList(req, res) {
        const pageSize = 15;
        const requestedPage = Math.max(parseInt(req.query.page, 10) || 1, 1);

        Product.getProductsCount((countErr, countResults) => {
            if (countErr) {
                console.error('Failed to count products:', countErr);
                return res.status(500).send('Failed to load products.');
            }

            const totalProducts = (countResults && countResults[0] && Number(countResults[0].total)) || 0;
            const totalPages = Math.max(Math.ceil(totalProducts / pageSize), 1);
            const currentPage = Math.min(requestedPage, totalPages);
            const offset = (currentPage - 1) * pageSize;

            Product.getPaginatedProducts(pageSize, offset, (listErr, products) => {
                if (listErr) {
                    console.error('Failed to load products:', listErr);
                    return res.status(500).send('Failed to load products.');
                }

                Product.getDistinctCategories((catErr, categoryResults) => {
                    if (catErr) {
                        console.error('Failed to load categories:', catErr);
                        return res.status(500).send('Failed to load categories.');
                    }

                    const categories = Array.isArray(categoryResults)
                        ? categoryResults.map(row => row.category).filter(Boolean)
                        : [];

                    res.render('shopping', {
                        products,
                        categories,
                        pagination: {
                            currentPage,
                            totalPages,
                            totalProducts,
                            pageSize
                        }
                    });
                });
            });
        });
    },

    search(req, res) {
        const query = (req.query.q || '').trim();
        const limit = req.query.limit;

        if (!query) {
            return res.json({ products: [] });
        }

        Product.searchProductsByName(query, limit, (err, products) => {
            if (err) {
                console.error('Product search failed:', err);
                return res.status(500).json({ error: 'Failed to search products.' });
            }
            res.json({ products: Array.isArray(products) ? products : [] });
        });
    },

    // Get a single product by ID and render product page
    getProductById(req, res) {
        const productId = req.params.id;
        Product.getProductById(productId, (err, results) => {
            if (err) {
                console.error('Error retrieving product:', err);
                return res.status(500).send('Error retrieving product.');
            }
            const product = results && results[0];
            if (!product) {
                return res.status(404).send('Product not found.');
            }
            res.render('product', { product });
        });
    },

    // Render add-product form (admin only)
    showAddForm(req, res) {
        if (req.session?.role !== 'admin') {
            return res.status(403).send('Unauthorized: admin role required.');
        }
        res.render('addProduct');
    },

    // Add a new product (admin only)
    addProduct(req, res) {
        const role = req.session?.role;
        if (role !== 'admin') {
            return res.status(403).send('Unauthorized: admin role required.');
        }

        const files = req.files || {};
        const product = {
            product_name: req.body.product_name,
            description: req.body.description,
            ingredient_list: req.body.ingredient_list,
            price: req.body.price,
            stock: req.body.stock,
            category: req.body.category,
            image1: files.image1?.[0]?.filename || null,
            image2: files.image2?.[0]?.filename || null
        };

        if (!product.image1) {
            return res.status(400).send('Primary image is required.');
        }

        Product.addProduct(product, role, (err, result) => {
            if (err) {
                console.error('Failed to add product:', err);
                return res.status(500).send('Failed to add product.');
            }
            req.flash('success', 'Product added successfully.');
            res.redirect('/inventory');
        });
    },

    // Render update-product form with existing data (admin only)
    showUpdateForm(req, res) {
        if (req.session?.role !== 'admin') {
            return res.status(403).send('Unauthorized: admin role required.');
        }

        const productId = req.params.id;
        Product.getProductById(productId, (err, results) => {
            if (err) {
                console.error('Error retrieving product:', err);
                return res.status(500).send('Error retrieving product.');
            }
            const product = results && results[0];
            if (!product) {
                return res.status(404).send('Product not found.');
            }
            res.render('updateProduct', { product });
        });
    },

    // Update a product (admin only)
    updateProduct(req, res) {
        const role = req.session?.role;
        if (role !== 'admin') {
            return res.status(403).send('Unauthorized: admin role required.');
        }

        const productId = req.params.id;
        const files = req.files || {};
        const product = {
            product_name: req.body.product_name,
            description: req.body.description,
            ingredient_list: req.body.ingredient_list,
            price: req.body.price,
            stock: req.body.stock,
            category: req.body.category,
            image1: files.image1?.[0]?.filename || req.body.image1 || null,
            image2: files.image2?.[0]?.filename || req.body.image2 || null
        };

        Product.updateProduct(productId, product, role, (err) => {
            if (err) {
                console.error('Failed to update product:', err);
                return res.status(500).send('Failed to update product.');
            }
            req.flash('success', 'Product updated successfully.');
            res.redirect('/inventory');
        });
    },

    // Delete a product (admin only)
    deleteProduct(req, res) {
        const role = req.session?.role;
        if (role !== 'admin') {
            return res.status(403).send('Unauthorized: admin role required.');
        }

        const productId = req.params.id;
        Product.deleteProduct(productId, role, (err) => {
            if (err) {
                console.error('Failed to delete product:', err);
                return res.status(500).send('Failed to delete product.');
            }
            req.flash('success', 'Product deleted successfully.');
            res.redirect('/inventory');
        });
    }
};

module.exports = ProductController;
