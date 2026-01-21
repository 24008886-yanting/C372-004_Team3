const Cart = require('../models/Cart');
const Wishlist = require('../models/Wishlist');

// Helper: try to render an EJS view; if not available, fall back to JSON.
const renderOrJson = (res, view, payload) => {
  res.render(view, payload, (err, html) => {
    if (err) {
      return res.json(payload);
    }
    res.send(html);
  });
};

// Extract userId from session/body/query to keep endpoints flexible
const resolveUserId = (req) =>
  req.session?.user_id ||
  req.body?.user_id ||
  req.query?.userId ||
  req.params?.userId;

// Manages items in the shopping cart
const CartController = {
  // View the current user's cart
  viewCart(req, res) {
    const userId = resolveUserId(req);
    if (!userId) return res.status(400).json({ error: 'user_id is required' });

    Cart.getCartByUser(userId, (err, items) => {
      if (err) return res.status(500).json({ error: 'Failed to load cart', details: err });
      // Render main cart page; fall back to JSON if view missing
      renderOrJson(res, 'cart', { items });
    });
  },

  // Add an item to the cart (or increment quantity if it already exists)
  addItem(req, res) {
    const userId = resolveUserId(req);
    const { product_id, quantity } = req.body || {};

    if (!userId || !product_id) {
      return res.status(400).json({ error: 'user_id and product_id are required' });
    }

    Cart.addItem(userId, product_id, quantity || 1, (err, result) => {
      if (err) {
        const message = err.message || String(err);
        const status = message.includes('not enough stock') ? 400 : message.includes('Product not found') ? 404 : 500;
        return res.status(status).json({ error: 'Failed to add item to cart', details: message });
      }
      const action = result?.action === 'updated' ? 'updated' : 'added';
      const message = action === 'updated' ? 'Item quantity updated in cart.' : 'Item added to cart successfully.';
      Wishlist.removeItemByUserAndProduct(userId, product_id, (removeErr) => {
        if (removeErr) {
          console.error('Failed to remove wishlist item after cart add:', removeErr);
        }
        renderOrJson(res, 'cart/add-success', { message, action, result });
      });
    });
  },

  // Update the quantity of a specific cart line
  updateQuantity(req, res) {
    const userId = resolveUserId(req);
    const { id } = req.params;
    const { quantity } = req.body || {};

    if (!userId || !id) {
      return res.status(400).json({ error: 'user_id and cart item id are required' });
    }

    Cart.updateQuantity(id, userId, quantity || 1, (err, result) => {
      if (err) {
        const message = err.message || String(err);
        const status = message.includes('not enough stock') ? 400 : message.includes('not found') ? 404 : 500;
        return res.status(status).json({ error: 'Failed to update cart item', details: message });
      }
      if (result?.affectedRows === 0) return res.status(404).json({ error: 'Cart item not found' });
      renderOrJson(res, 'cart/update-success', { message: 'Cart item updated', cart_id: id });
    });
  },

  // Remove a specific item from the cart
  removeItem(req, res) {
    const userId = resolveUserId(req);
    const { id } = req.params;
    if (!userId || !id) {
      return res.status(400).json({ error: 'user_id and cart item id are required' });
    }

    Cart.removeItem(id, userId, (err, result) => {
      if (err) return res.status(500).json({ error: 'Failed to remove cart item', details: err.message || err });
      if (result?.affectedRows === 0) return res.status(404).json({ error: 'Cart item not found' });
      renderOrJson(res, 'cart/delete-success', { message: 'Cart item removed', cart_id: id });
    });
  },

  // Clear all items from the user's cart
  clearCart(req, res) {
    const userId = resolveUserId(req);
    if (!userId) return res.status(400).json({ error: 'user_id is required' });

    Cart.clearCart(userId, (err) => {
      if (err) return res.status(500).json({ error: 'Failed to clear cart', details: err });
      renderOrJson(res, 'cart/clear-success', { message: 'Cart cleared' });
    });
  },

  // Checkout: create order + order_items from cart and empty the cart
  checkout(req, res) {
    const userId = resolveUserId(req);
    if (!userId) return res.status(400).json({ error: 'user_id is required' });

    const role = (req.session?.role || '').toLowerCase();
    const { voucher_id, shipping_fee, tax_rate, discount_amount } = req.body || {};

    if (role !== 'adopter' && (voucher_id || discount_amount)) {
      return res.status(403).json({ error: 'Only adopters can use vouchers or discounts at checkout' });
    }

    const checkoutOptions = { voucher_id, shipping_fee, tax_rate, discount_amount };

    Cart.checkout(userId, checkoutOptions, (err, summary) => {
      if (err) {
        const message = err.message || String(err);
        const status = message.toLowerCase().includes('stock') || message.toLowerCase().includes('empty') ? 400 : 500;
        return res.status(status).json({ error: 'Checkout failed', details: message });
      }
      renderOrJson(res, 'cart/checkout-success', { message: 'Checkout complete', order: summary });
    });
  }
};

module.exports = CartController;
