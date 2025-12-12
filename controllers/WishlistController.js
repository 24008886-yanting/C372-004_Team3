const Wishlist = require('../models/Wishlist');

// Helper: render EJS if present; otherwise JSON
const renderOrJson = (res, view, payload) => {
  res.render(view, payload, (err, html) => {
    if (err) {
      return res.json(payload);
    }
    res.send(html);
  });
};

// Extract userId from session/body/query/params
const resolveUserId = (req) =>
  req.session?.user_id ||
  req.body?.user_id ||
  req.query?.userId ||
  req.params?.userId;

const WishlistController = {
  // View wishlist for the current user
  view(req, res) {
    const userId = resolveUserId(req);
    if (!userId) return res.status(400).json({ error: 'user_id is required' });

    Wishlist.getByUser(userId, (err, items) => {
      if (err) return res.status(500).json({ error: 'Failed to load wishlist', details: err });
      // Render main wishlist page; fall back to JSON if view missing
      renderOrJson(res, 'wishlist', { items });
    });
  },

  // Add a product to wishlist
  add(req, res) {
    const userId = resolveUserId(req);
    const { product_id } = req.body || {};
    if (!userId || !product_id) {
      return res.status(400).json({ error: 'user_id and product_id are required' });
    }

    Wishlist.addItem(userId, product_id, (err, result) => {
      if (err) {
        const message = err.message || String(err);
        const status = message.includes('not found') ? 404 : 500;
        return res.status(status).json({ error: 'Failed to add to wishlist', details: message });
      }
      renderOrJson(res, 'wishlist/add-success', { message: 'Added to wishlist', result });
    });
  },

  // Remove a wishlist item
  remove(req, res) {
    const userId = resolveUserId(req);
    const { id } = req.params;
    if (!userId || !id) {
      return res.status(400).json({ error: 'user_id and wishlist id are required' });
    }

    Wishlist.removeItem(id, userId, (err, result) => {
      if (err) return res.status(500).json({ error: 'Failed to remove wishlist item', details: err.message || err });
      if (result?.affectedRows === 0) return res.status(404).json({ error: 'Wishlist item not found' });
      renderOrJson(res, 'wishlist/delete-success', { message: 'Removed from wishlist', wishlist_id: id });
    });
  },

  // Move a cart item to wishlist
  moveFromCart(req, res) {
    const userId = resolveUserId(req);
    const { id } = req.params; // cart_id
    if (!userId || !id) {
      return res.status(400).json({ error: 'user_id and cart id are required' });
    }

    Wishlist.moveFromCart(id, userId, (err, result) => {
      if (err) {
        const message = err.message || String(err);
        const status = message.toLowerCase().includes('not found') ? 404 : 500;
        return res.status(status).json({ error: 'Failed to move item to wishlist', details: message });
      }
      renderOrJson(res, 'wishlist/move-success', { message: 'Moved to wishlist', cart_id: id, result });
    });
  },

  // Move a wishlist item to cart
  moveToCart(req, res) {
    const userId = resolveUserId(req);
    const { id } = req.params; // wishlist_id
    const { quantity } = req.body || {};

    if (!userId || !id) {
      return res.status(400).json({ error: 'user_id and wishlist id are required' });
    }

    Wishlist.moveToCart(id, userId, quantity || 1, (err, result) => {
      if (err) {
        const message = err.message || String(err);
        const status = message.toLowerCase().includes('not found') ? 404 : message.toLowerCase().includes('stock') ? 400 : 500;
        return res.status(status).json({ error: 'Failed to move item to cart', details: message });
      }
      renderOrJson(res, 'wishlist/move-to-cart-success', { message: 'Moved to cart', wishlist_id: id, result });
    });
  }
};

module.exports = WishlistController;
