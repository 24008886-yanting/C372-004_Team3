const Wishlist = require('../models/Wishlist');
const Cart = require('../models/Cart');

// Helper: render EJS if present; otherwise JSON
const renderOrJson = (req, res, view, payload) => {
  const accept = req.headers.accept || '';
  const wantsJson = req.xhr || accept.includes('application/json');
  if (wantsJson) {
    return res.json(payload);
  }

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
      renderOrJson(req, res, 'wishlist', { items });
    });
  },

  // Add a product to wishlist
  add(req, res) {
    const userId = resolveUserId(req);
    const { product_id } = req.body || {};
    if (!userId || !product_id) {
      return res.status(400).json({ error: 'user_id and product_id are required' });
    }

    Cart.getItemByUserAndProduct(userId, product_id, (cartErr, cartRows) => {
      if (cartErr) {
        return res.status(500).json({ error: 'Failed to check cart', details: cartErr.message || cartErr });
      }
      if (cartRows && cartRows.length > 0) {
        return res.status(409).json({
          error: 'Item is already in cart',
          details: 'Move it to wishlist from the cart to avoid duplicates.'
        });
      }

      Wishlist.addItem(userId, product_id, (err, result) => {
        if (err) {
          const message = err.message || String(err);
          const lower = message.toLowerCase();
          const status = lower.includes('not found') ? 404 : lower.includes('unavailable') ? 409 : 500;
          return res.status(status).json({ error: 'Failed to add to wishlist', details: message });
        }

        Wishlist.getItemByUserAndProduct(userId, product_id, (findErr, rows) => {
          if (findErr) {
            console.error('Failed to load wishlist item:', findErr);
          }
          const wishlistItem = rows && rows[0];
          const wishlistId = wishlistItem ? wishlistItem.wishlist_id : null;
          renderOrJson(req, res, 'wishlist/add-success', {
            message: 'Added to wishlist',
            wishlist_id: wishlistId,
            product_id,
            result
          });
        });
      });
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
      renderOrJson(req, res, 'wishlist/delete-success', { message: 'Removed from wishlist', wishlist_id: id });
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
        const lower = message.toLowerCase();
        const status = lower.includes('not found') ? 404 : lower.includes('unavailable') ? 409 : 500;
        return res.status(status).json({ error: 'Failed to move item to wishlist', details: message });
      }
      renderOrJson(req, res, 'wishlist/move-success', { message: 'Moved to wishlist', cart_id: id, result });
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
        const lower = message.toLowerCase();
        const status = lower.includes('not found') ? 404 : lower.includes('stock') || lower.includes('unavailable') ? 400 : 500;
        return res.status(status).json({ error: 'Failed to move item to cart', details: message });
      }
      renderOrJson(req, res, 'wishlist/move-to-cart-success', { message: 'Moved to cart', wishlist_id: id, result });
    });
  }
};

module.exports = WishlistController;
