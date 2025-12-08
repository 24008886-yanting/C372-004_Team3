const db = require('../db');

const ProductModel = {
    getAllProducts(callback) {
        const query = 'SELECT product_id, product_name, description, ingredient_list, price, stock, category FROM products';
        db.query(query, callback);
    },

    getProductById(productId, callback) {
        const query = 'SELECT product_id, product_name, description, ingredient_list, price, stock, category FROM products WHERE product_id = ?';
        db.query(query, [productId], callback);
    },

    getProductByName(productName, callback) {
        const query = 'SELECT product_id, product_name, description, ingredient_list, price, stock, category FROM products WHERE product_name LIKE ?';
        db.query(query, [`%${productName}%`], callback);
    },

    getDistinctCategories(callback) {
        const query = 'SELECT DISTINCT category FROM products';
        db.query(query, callback);
    },

    addProduct(product, role, callback) {
        if (role !== 'admin') {
            return callback(new Error('Unauthorized: admin role required to add products'));
        }

        const { product_name, description, ingredient_list, price, stock, category } = product;
        const query = `INSERT INTO products (product_name, description, ingredient_list, price, stock, category)
                       VALUES (?, ?, ?, ?, ?, ?)`;
        const params = [product_name, description, ingredient_list, price, stock, category];

        db.query(query, params, (err, result) => {
            if (err) return callback(err);
            callback(null, { product_id: result.insertId, ...product });
        });
    },

    updateProduct(productId, product, role, callback) {
        if (role !== 'admin') {
            return callback(new Error('Unauthorized: admin role required to update products'));
        }

        const { product_name, description, ingredient_list, price, stock, category } = product;
        const query = `UPDATE products
                       SET product_name = ?, description = ?, ingredient_list = ?, price = ?, stock = ?, category = ?
                       WHERE product_id = ?`;
        const params = [product_name, description, ingredient_list, price, stock, category, productId];

        db.query(query, params, callback);
    },

    deleteProduct(productId, role, callback) {
        if (role !== 'admin') {
            return callback(new Error('Unauthorized: admin role required to delete products'));
        }

        const query = 'DELETE FROM products WHERE product_id = ?';
        db.query(query, [productId], callback);
    }
};

module.exports = ProductModel;
