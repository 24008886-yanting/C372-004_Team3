const db = require('../db');

const ProductModel = {
    getAllProducts(callback) {
        // Fetch all product fields for admin inventory.
        const query = `SELECT 
            product_id, 
            product_name, 
            description, 
            ingredient_list, 
            price, 
            stock, 
            category,
            image1,
            image2,
            status
        FROM products`;
        db.query(query, callback);
    },

    getProductsCount(callback) {
        // Count only products that are available for customers.
        const query = 'SELECT COUNT(*) AS total FROM products WHERE COALESCE(status, "available") = "available"';
        db.query(query, callback);
    },

    getPaginatedProducts(limit, offset, callback) {
        // Fetch a page of available products for the shopping list.
        const query = `SELECT 
            product_id, 
            product_name, 
            description, 
            ingredient_list, 
            price, 
            stock, 
            category,
            image1,
            image2,
            status
        FROM products
        WHERE COALESCE(status, "available") = "available"
        ORDER BY product_id
        LIMIT ? OFFSET ?`;
        db.query(query, [limit, offset], callback);
    },

    getProductById(productId, callback) {
        // Load a single product by its ID.
        const query = `SELECT 
            product_id, 
            product_name, 
            description, 
            ingredient_list, 
            price, 
            stock, 
            category,
            image1,
            image2,
            status
        FROM products
        WHERE product_id = ?`;
        db.query(query, [productId], callback);
    },

    getProductByName(productName, callback) {
        // Find products with similar names.
        const query = `SELECT 
            product_id, 
            product_name, 
            description, 
            ingredient_list, 
            price, 
            stock, 
            category,
            image1,
            image2,
            status
        FROM products
        WHERE product_name LIKE ?`;
        db.query(query, [`%${productName}%`], callback);
    },

    searchProductsByName(term, limit = 10, callback) {
        // Normalize inputs and clamp limit to avoid abuse.
        const trimmedTerm = (term || '').toLowerCase();
        const safeLimit = Math.max(Math.min(parseInt(limit, 10) || 10, 50), 1);
        // Use LIKE against lowercased fields for simple, case-insensitive matching.
        const likeTerm = `%${trimmedTerm}%`;

        // Search by product name or category for autocomplete/search.
        const query = `SELECT 
            product_id, 
            product_name, 
            description, 
            ingredient_list, 
            price, 
            stock, 
            category,
            image1,
            image2,
            status
        FROM products
        WHERE COALESCE(status, "available") = "available"
          AND (LOWER(product_name) LIKE ? OR LOWER(category) LIKE ?)
        ORDER BY product_name
        LIMIT ?`;

        db.query(query, [likeTerm, likeTerm, safeLimit], callback);
    },

    getDistinctCategories(callback) {
        // Provide category list for filter UI.
        const query = 'SELECT DISTINCT category FROM products WHERE COALESCE(status, "available") = "available"';
        db.query(query, callback);
    },

    addProduct(product, role, callback) {
        // Enforce admin-only creation at the model layer too.
        if (role !== 'admin') {
            return callback(new Error('Unauthorized: admin role required to add products'));
        }

        const { product_name, description, ingredient_list, price, stock, category, image1, image2 } = product;
        const status = 'available';
        // Insert a new product with default status.
        const query = `INSERT INTO products (product_name, description, ingredient_list, price, stock, category, image1, image2, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
         const params = [product_name, description, ingredient_list, price, stock, category, image1, image2, status];

        db.query(query, params, (err, result) => {
            if (err) return callback(err);
            callback(null, { product_id: result.insertId, ...product });
        });
    },

    updateProduct(productId, product, role, callback) {
        // Enforce admin-only updates at the model layer too.
        if (role !== 'admin') {
            return callback(new Error('Unauthorized: admin role required to update products'));
        }

        const { product_name, description, ingredient_list, price, stock, category, image1, image2 } = product;
        // Update core fields (images included) for the product.
        const query = `UPDATE products
               SET product_name = ?, description = ?, ingredient_list = ?, price = ?, stock = ?, category = ?, image1 = ?, image2 = ?
             WHERE product_id = ?`;
         const params = [product_name, description, ingredient_list, price, stock, category, image1, image2, productId];

        db.query(query, params, callback);
    },

    deleteProduct(productId, role, callback) {
        // Enforce admin-only deletion at the model layer too.
        if (role !== 'admin') {
            return callback(new Error('Unauthorized: admin role required to delete products'));
        }

        // Permanently remove the product row.
        const query = 'DELETE FROM products WHERE product_id = ?';
        db.query(query, [productId], callback);
    },

    updateStatus(productId, status, role, callback) {
        // Enforce admin-only status changes at the model layer too.
        if (role !== 'admin') {
            return callback(new Error('Unauthorized: admin role required to update products'));
        }

        // Only allow known status values.
        const nextStatus = String(status || '').toLowerCase();
        if (!['available', 'unavailable'].includes(nextStatus)) {
            return callback(new Error('Invalid product status'));
        }

        // Persist the status change.
        const query = 'UPDATE products SET status = ? WHERE product_id = ?';
        db.query(query, [nextStatus, productId], callback);
    },

    getProductUsageCounts(productId, callback) {
        // Check whether a product is referenced in carts or wishlists.
        const query = `
            SELECT
                (SELECT COUNT(*) FROM cart WHERE product_id = ?) AS cartCount,
                (SELECT COUNT(*) FROM wishlist WHERE product_id = ?) AS wishlistCount
        `;
        db.query(query, [productId, productId], (err, rows) => {
            if (err) return callback(err);
            const row = rows && rows[0] ? rows[0] : { cartCount: 0, wishlistCount: 0 };
            callback(null, {
                cartCount: Number(row.cartCount) || 0,
                wishlistCount: Number(row.wishlistCount) || 0
            });
        });
    }
};

module.exports = ProductModel;
