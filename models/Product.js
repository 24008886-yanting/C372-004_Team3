const db = require('../db');

const ProductModel = {
    getAllProducts(callback) {
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
        const query = 'SELECT COUNT(*) AS total FROM products WHERE COALESCE(status, "available") = "available"';
        db.query(query, callback);
    },

    getPaginatedProducts(limit, offset, callback) {
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
        const trimmedTerm = (term || '').toLowerCase();
        const safeLimit = Math.max(Math.min(parseInt(limit, 10) || 10, 50), 1);
        const likeTerm = `%${trimmedTerm}%`;

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
        const query = 'SELECT DISTINCT category FROM products WHERE COALESCE(status, "available") = "available"';
        db.query(query, callback);
    },

    addProduct(product, role, callback) {
        if (role !== 'admin') {
            return callback(new Error('Unauthorized: admin role required to add products'));
        }

        const { product_name, description, ingredient_list, price, stock, category, image1, image2 } = product;
        const status = 'available';
        const query = `INSERT INTO products (product_name, description, ingredient_list, price, stock, category, image1, image2, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
         const params = [product_name, description, ingredient_list, price, stock, category, image1, image2, status];

        db.query(query, params, (err, result) => {
            if (err) return callback(err);
            callback(null, { product_id: result.insertId, ...product });
        });
    },

    updateProduct(productId, product, role, callback) {
        if (role !== 'admin') {
            return callback(new Error('Unauthorized: admin role required to update products'));
        }

        const { product_name, description, ingredient_list, price, stock, category, image1, image2 } = product;
        const query = `UPDATE products
               SET product_name = ?, description = ?, ingredient_list = ?, price = ?, stock = ?, category = ?, image1 = ?, image2 = ?
             WHERE product_id = ?`;
         const params = [product_name, description, ingredient_list, price, stock, category, image1, image2, productId];

        db.query(query, params, callback);
    },

    deleteProduct(productId, role, callback) {
        if (role !== 'admin') {
            return callback(new Error('Unauthorized: admin role required to delete products'));
        }

        const query = 'DELETE FROM products WHERE product_id = ?';
        db.query(query, [productId], callback);
    },

    updateStatus(productId, status, role, callback) {
        if (role !== 'admin') {
            return callback(new Error('Unauthorized: admin role required to update products'));
        }

        const nextStatus = String(status || '').toLowerCase();
        if (!['available', 'unavailable'].includes(nextStatus)) {
            return callback(new Error('Invalid product status'));
        }

        const query = 'UPDATE products SET status = ? WHERE product_id = ?';
        db.query(query, [nextStatus, productId], callback);
    },

    getProductUsageCounts(productId, callback) {
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
