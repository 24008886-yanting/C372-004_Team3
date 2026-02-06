const Product = require('../models/Product');
const Wishlist = require('../models/Wishlist');
const Review = require('../models/Review');

const ProductController = {
    // List all products on the inventory page (admin view)
    listInventory(req, res) {
        console.log('listInventory called - user:', req.session?.user, 'role:', req.session?.role);
        Product.getAllProducts((err, products) => {
            if (err) {
                console.error('Failed to load inventory:', err);
                console.error('Error details:', err.message, err.stack);
                console.error('Full error object:', JSON.stringify(err, null, 2));
                return res.status(500).render('inventory', { products: [], messages: { error: err.message } });
            }
            console.log('Products loaded successfully:', products?.length || 0, 'products');
            const success = (req.flash && req.flash('success')[0]) || undefined;
            const error = (req.flash && req.flash('error')[0]) || undefined;
            const deleteBlockRaw = (req.flash && req.flash('deleteBlock')[0]) || '';
            let deleteBlock = null;
            if (deleteBlockRaw) {
                try {
                    deleteBlock = JSON.parse(deleteBlockRaw);
                } catch (parseErr) {
                    deleteBlock = { message: deleteBlockRaw };
                }
            }
            res.render('inventory', { products, messages: { success, error, deleteBlock } });
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

                    const renderShopping = (wishlistMap) => {
                        res.render('shopping', {
                            products,
                            categories,
                            pagination: {
                                currentPage,
                                totalPages,
                                totalProducts,
                                pageSize
                            },
                            wishlistMap
                        });
                    };

                    const userId = req.session?.user_id;
                    if (!userId) {
                        renderShopping({});
                        return;
                    }

                    Wishlist.getByUser(userId, (wishErr, items) => {
                        if (wishErr) {
                            console.error('Failed to load wishlist:', wishErr);
                            return renderShopping({});
                        }

                        const wishlistMap = {};
                        (items || []).forEach(item => {
                            wishlistMap[item.product_id] = item.wishlist_id;
                        });
                        renderShopping(wishlistMap);
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
            const userId = req.session?.user_id;
            Review.getReviewsByProduct(productId, (reviewErr, reviews) => {
                if (reviewErr) {
                    console.error('Failed to load reviews:', reviewErr);
                }
                const safeReviews = Array.isArray(reviews)
                    ? reviews.filter(r => r && r.review_text && String(r.review_text).trim())
                    : [];

                if (!userId) {
                    res.render('product', { product, wishlistItem: null, reviews: safeReviews });
                    return;
                }

                Wishlist.getByUser(userId, (wishErr, items) => {
                    if (wishErr) {
                        console.error('Failed to load wishlist:', wishErr);
                        return res.render('product', { product, wishlistItem: null, reviews: safeReviews });
                    }

                    const wishlistItem = (items || []).find(item => String(item.product_id) === String(productId)) || null;
                    res.render('product', { product, wishlistItem, reviews: safeReviews });
                });
            });
        });
    },

    // Render add-product form (admin only)
    showAddForm(req, res) {
        if (req.session?.role !== 'admin') {
            return res.status(403).send('Unauthorized: admin role required.');
        }
        const error = (req.flash && req.flash('error')[0]) || undefined;
        res.render('addProduct', { messages: { error } });
    },

    // Add a new product (admin only)
    addProduct(req, res) {
        const role = req.session?.role;
        if (role !== 'admin') {
            return res.status(403).send('Unauthorized: admin role required.');
        }

        const files = req.files || {};
        const product = {
            product_name: (req.body.product_name || '').trim(),
            description: (req.body.description || '').trim(),
            ingredient_list: (req.body.ingredient_list || '').trim(),
            price: Number(req.body.price || 0),
            stock: Number(req.body.stock || 0),
            category: (req.body.category || '').trim(),
            image1: files.image1?.[0]?.filename || null,
            image2: files.image2?.[0]?.filename || null
        };

        Product.addProduct(product, role, (err, result) => {
            if (err) {
                console.error('Failed to add product:', err);
                if (req.flash) req.flash('error', 'Failed to add product.');
                return res.redirect('/products/new');
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
            product_name: (req.body.product_name || '').trim(),
            description: (req.body.description || '').trim(),
            ingredient_list: (req.body.ingredient_list || '').trim(),
            price: Number(req.body.price || 0),
            stock: Number(req.body.stock || 0),
            category: (req.body.category || '').trim(),
            image1: files.image1?.[0]?.filename || req.body.image1 || null,
            image2: files.image2?.[0]?.filename || req.body.image2 || null
        };

        Product.updateProduct(productId, product, role, (err) => {
            if (err) {
                console.error('Failed to update product:', err);
                if (req.flash) req.flash('error', 'Failed to update product.');
                return res.redirect(`/products/${productId}/edit`);
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
        Product.getProductUsageCounts(productId, (countErr, usage) => {
            if (countErr) {
                console.error('Failed to check product usage:', countErr);
                return res.status(500).send('Failed to delete product.');
            }

            const cartCount = usage?.cartCount || 0;
            const wishlistCount = usage?.wishlistCount || 0;
            if (cartCount > 0 || wishlistCount > 0) {
                const reasonParts = [];
                if (cartCount) reasonParts.push(`${cartCount} cart${cartCount === 1 ? '' : 's'}`);
                if (wishlistCount) reasonParts.push(`${wishlistCount} wishlist${wishlistCount === 1 ? '' : 's'}`);
                const reason = reasonParts.length ? `Still referenced in ${reasonParts.join(' and ')}.` : 'Still referenced in carts or wishlists.';
                if (req.flash) {
                    req.flash('deleteBlock', JSON.stringify({
                        productId,
                        reason,
                        cartCount,
                        wishlistCount
                    }));
                }
                return res.redirect('/inventory');
            }

            Product.deleteProduct(productId, role, (err) => {
                if (err) {
                    console.error('Failed to delete product:', err);
                    return res.status(500).send('Failed to delete product.');
                }
                req.flash('success', 'Product deleted successfully.');
                res.redirect('/inventory');
            });
        });
    },

    updateStatus(req, res) {
        const role = req.session?.role;
        if (role !== 'admin') {
            return res.status(403).send('Unauthorized: admin role required.');
        }

        const productId = req.params.id;
        const status = req.body?.status;
        Product.updateStatus(productId, status, role, (err) => {
            if (err) {
                console.error('Failed to update product status:', err);
                if (req.flash) req.flash('error', 'Failed to update product status.');
                return res.redirect('/inventory');
            }
            req.flash('success', 'Product status updated successfully.');
            res.redirect('/inventory');
        });
    }
};

module.exports = ProductController;
