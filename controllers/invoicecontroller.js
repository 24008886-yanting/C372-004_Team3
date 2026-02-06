const connection = require('../db'); // ensure your controller uses same DB connection
const Cart = require('../models/Cart');

const InvoiceController = {
    // Process payment: deduct stock, create session invoice, clear cart
    processInvoice(req, res) {
        const userId = req.session?.user_id;
        const user = req.session?.user || { username: 'guest' };

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        // Fetch cart from database
        Cart.getCartByUser(userId, (cartErr, cartItems) => {
            if (cartErr) {
                console.error('Error fetching cart:', cartErr);
                return res.status(400).json({
                    success: false,
                    message: 'Your cart is empty'
                });
            }

            if (!cartItems || cartItems.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Your cart is empty'
                });
            }

            // start transaction
            connection.beginTransaction(transErr => {
                if (transErr) {
                    console.error('Transaction begin error', transErr);
                    return res.status(500).json({
                        success: false,
                        message: 'Server error processing order'
                    });
                }

                // For each cart item: check stock then update
                const checks = cartItems.map(item => {
                    return new Promise((resolve, reject) => {
                        connection.query('SELECT stock, product_name, price FROM products WHERE product_id = ?', [item.product_id], (err, results) => {
                            if (err) return reject(err);
                            if (!results || results.length === 0) return reject(new Error(`Product ${item.product_id} not found`));

                            const dbRow = results[0];
                            const available = parseInt(dbRow.stock, 10) || 0;
                            if (available < item.quantity) return reject(new Error(`Insufficient stock for ${dbRow.product_name}`));

                            // update quantity
                            connection.query('UPDATE products SET stock = stock - ? WHERE product_id = ?', [item.quantity, item.product_id], (err2) => {
                                if (err2) return reject(err2);
                                resolve({
                                    id: item.product_id,
                                    productName: dbRow.product_name,
                                    price: parseFloat(dbRow.price) || 0,
                                    quantity: item.quantity,
                                    subtotal: (parseFloat(dbRow.price) || 0) * item.quantity
                                });
                            });
                        });
                    });
                });

                Promise.all(checks)
                    .then(invoiceItems => {
                        connection.commit(commitErr => {
                            if (commitErr) {
                                console.error('Commit error', commitErr);
                                return connection.rollback(() => {
                                    return res.status(500).json({
                                        success: false,
                                        message: 'Server error processing order'
                                    });
                                });
                            }

                            // Calculate subtotal first
                            const subtotal = invoiceItems.reduce((s, it) => s + it.subtotal, 0);

                            // Calculate totals for order from request body
                            console.log('req.body:', req.body);
                            const shippingFee = parseFloat(req.body?.shipping_fee) || 0;
                            const taxRate = parseFloat(req.body?.tax_rate) || 0;
                            const discountAmount = parseFloat(req.body?.discount_amount) || 0;
                            const voucherId = req.body?.voucher_id || null;
                            
                            // GST is included in item prices; compute included portion for record.
                            const taxAmount = taxRate > 0 ? (subtotal * (taxRate / (100 + taxRate))) : 0;
                            
                            // Total amount calculation (no extra tax added)
                            const totalAmount = subtotal + shippingFee - discountAmount;

                            console.log('Order Calculation:', { subtotal, shippingFee, taxRate, taxAmount, discountAmount, totalAmount });

                            // Build invoice object with all calculated values
                            const invoice = {
                                id: `INV-${Date.now()}`,
                                user: user.username || user.email || 'guest',
                                date: new Date(),
                                items: invoiceItems,
                                subtotal: subtotal,
                                shippingFee: shippingFee,
                                taxAmount: taxAmount,
                                discountAmount: discountAmount,
                                total: totalAmount
                            };

                            // Create order record in database
                            const orderSql = `
                                INSERT INTO orders (user_id, subtotal, discount_amount, shipping_fee, tax_amount, total_amount, voucher_id, payment_status)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            `;

                            connection.query(orderSql, [userId, subtotal, discountAmount, shippingFee, taxAmount, totalAmount, voucherId, 'PAID'], (orderErr, orderResult) => {
                                if (orderErr) {
                                    console.error('Error creating order:', orderErr.message);
                                    console.error('SQL:', orderSql);
                                    console.error('Values:', [userId, subtotal, discountAmount, shippingFee, taxAmount, totalAmount, voucherId]);
                                    return res.status(500).json({
                                        success: false,
                                        message: 'Error saving order: ' + orderErr.message
                                    });
                                }

                                const orderId = orderResult.insertId;
                                const trackingSql = `
                                    INSERT INTO order_tracking (order_id, status)
                                    VALUES (?, 'in_warehouse')
                                    ON DUPLICATE KEY UPDATE status = status
                                `;

                                connection.query(trackingSql, [orderId], (trackingErr) => {
                                    if (trackingErr) {
                                        console.error('Error creating initial tracking status:', trackingErr.message);
                                    }
                                });

                                // Create order items
                                const itemInserts = invoiceItems.map(item => [orderId, item.id, item.quantity, item.price, item.subtotal]);
                                const itemSql = 'INSERT INTO order_items (order_id, product_id, quantity, price_each, item_total) VALUES ?';

                                connection.query(itemSql, [itemInserts], (itemErr) => {
                                    if (itemErr) {
                                        console.error('Error creating order items:', itemErr);
                                        return res.status(500).json({
                                            success: false,
                                            message: 'Error saving order items'
                                        });
                                    }

                                    // Clear cart
                                    Cart.clearCart(userId, (clearErr) => {
                                        if (clearErr) console.error('Error clearing cart:', clearErr);

                                        req.session.invoice = invoice;

                                        return res.json({
                                            success: true,
                                            message: 'Payment successful',
                                            invoice: invoice
                                        });
                                    });
                                });
                            });
                        });
                    })
                    .catch(err2 => {
                        console.error('Error processing cart items', err2);
                        connection.rollback(() => {
                            return res.status(400).json({
                                success: false,
                                message: err2.message || 'Error processing order'
                            });
                        });
                    });
            });
        });
    },

    // Render invoice page using session invoice
    viewInvoice(req, res) {
        const invoice = req.session.invoice;
        if (!invoice) {
            req.flash('error', 'No invoice available');
            return res.redirect('/shopping');
        }

        console.log('Displaying invoice from session:', JSON.stringify(invoice, null, 2));
        
        // compute cartCount (should be 0 after checkout) and render
        const cartCount = (req.session.cart || []).reduce((s, i) => s + (i.quantity || 0), 0);

        res.render('Invoice', {
            invoice,
            user: req.session.user,
            cartCount,
            messages: req.flash('success'),
            errors: req.flash('error')
        });
    }
};

module.exports = InvoiceController;
