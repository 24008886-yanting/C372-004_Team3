const Cart = require('../models/Cart');
const Voucher = require('../models/Voucher');
const Wishlist = require('../models/Wishlist');
const Wallet = require('../models/Wallet');
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';

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
    // Beginner note: loads cart items (and vouchers for adopters) then renders the cart page.
    delete req.session.invoice;
    
    const userId = resolveUserId(req);
    if (!userId) return res.status(400).json({ error: 'user_id is required' });

    Cart.getCartByUser(userId, (err, items) => {
      if (err) return res.status(500).json({ error: 'Failed to load cart', details: err });
      const role = (req.session?.role || '').toLowerCase();

      Wallet.ensureWallet(userId)
        .then((wallet) => {
          // Beginner note: only adopters see available vouchers in the cart.
          if (role !== 'adopter') {
            return renderOrJson(res, 'cart', { items, userRole: role || null, vouchers: [], paypalClientId: PAYPAL_CLIENT_ID, wallet });
          }

          Voucher.getAll((voucherErr, vouchers) => {
            if (voucherErr) {
              return renderOrJson(res, 'cart', { items, userRole: role || null, vouchers: [], paypalClientId: PAYPAL_CLIENT_ID, wallet });
            }
            renderOrJson(res, 'cart', { items, userRole: role || null, vouchers: vouchers || [], paypalClientId: PAYPAL_CLIENT_ID, wallet });
          });
        })
        .catch((walletErr) => {
          console.error('Failed to load wallet for cart:', walletErr);
          if (role !== 'adopter') {
            return renderOrJson(res, 'cart', { items, userRole: role || null, vouchers: [], paypalClientId: PAYPAL_CLIENT_ID, wallet: null });
          }
          Voucher.getAll((voucherErr, vouchers) => {
            if (voucherErr) {
              return renderOrJson(res, 'cart', { items, userRole: role || null, vouchers: [], paypalClientId: PAYPAL_CLIENT_ID, wallet: null });
            }
            renderOrJson(res, 'cart', { items, userRole: role || null, vouchers: vouchers || [], paypalClientId: PAYPAL_CLIENT_ID, wallet: null });
          });
        });
    });
  },

  // Add an item to the cart (or increment quantity if it already exists)
  addItem(req, res) {
    // Beginner note: if the item is already in the cart, it just increases the quantity.
    const userId = resolveUserId(req);
    const { product_id, quantity } = req.body || {};

    if (!userId || !product_id) {
      return res.status(400).json({ error: 'user_id and product_id are required' });
    }

    // If the item exists in wishlist, move it from wishlist -> cart.
    const proceedWithAdd = (wishlistItem) => {
      const hadWishlist = Boolean(wishlistItem);
      Cart.addItem(userId, product_id, quantity || 1, (err, result) => {
        if (err) {
          const message = err.message || String(err);
          const lower = message.toLowerCase();
          const status = lower.includes('not enough stock') || lower.includes('unavailable') ? 400 : lower.includes('product not found') ? 404 : 500;
          return res.status(status).json({ error: 'Failed to add item to cart', details: message });
        }
        const action = result?.action === 'updated' ? 'updated' : 'added';
        const message = hadWishlist
          ? 'Moved from wishlist to cart.'
          : action === 'updated'
            ? 'Item quantity updated in cart.'
            : 'Item added to cart successfully.';

        const finish = () => {
          renderOrJson(res, 'cart/add-success', {
            message,
            action,
            moved: hadWishlist,
            moved_from: hadWishlist ? 'wishlist' : null,
            moved_to: hadWishlist ? 'cart' : null,
            result
          });
        };

        if (!hadWishlist) return finish();
        Wishlist.removeItem(wishlistItem.wishlist_id, userId, (removeErr) => {
          if (removeErr) {
            console.error('Failed to remove wishlist item after cart add:', removeErr);
          }
          finish();
        });
      });
    };

    Wishlist.getItemByUserAndProduct(userId, product_id, (wishErr, wishRows) => {
      if (wishErr) {
        console.error('Failed to check wishlist before cart add:', wishErr);
        return proceedWithAdd(null);
      }
      const wishlistItem = wishRows && wishRows[0] ? wishRows[0] : null;
      proceedWithAdd(wishlistItem);
    });
  },

  // Update the quantity of a specific cart line
  updateQuantity(req, res) {
    // Beginner note: updates quantity for a single cart row (cart_id).
    const userId = resolveUserId(req);
    const { id } = req.params;
    const { quantity } = req.body || {};

    if (!userId || !id) {
      return res.status(400).json({ error: 'user_id and cart item id are required' });
    }

    Cart.updateQuantity(id, userId, quantity || 1, (err, result) => {
      if (err) {
        const message = err.message || String(err);
        const lower = message.toLowerCase();
        const status = lower.includes('not enough stock') || lower.includes('unavailable') ? 400 : lower.includes('not found') ? 404 : 500;
        return res.status(status).json({ error: 'Failed to update cart item', details: message });
      }
      if (result?.affectedRows === 0) return res.status(404).json({ error: 'Cart item not found' });
      renderOrJson(res, 'cart/update-success', { message: 'Cart item updated', cart_id: id });
    });
  },

  // Remove a specific item from the cart
  removeItem(req, res) {
    // Beginner note: deletes one cart row for the current user.
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
    // Beginner note: removes every cart row for the user.
    const userId = resolveUserId(req);
    if (!userId) return res.status(400).json({ error: 'user_id is required' });

    Cart.clearCart(userId, (err) => {
      if (err) return res.status(500).json({ error: 'Failed to clear cart', details: err });
      renderOrJson(res, 'cart/clear-success', { message: 'Cart cleared' });
    });
  },

  // Checkout: create order + order_items from cart and empty the cart
  checkout(req, res) {
    // Beginner note: converts cart to an order, then clears the cart.
    const userId = resolveUserId(req);
    if (!userId) return res.status(400).json({ error: 'user_id is required' });

    // Beginner note: voucher_id/discount_amount come from the cart page after "Apply" is successful.
    const { voucher_id, shipping_fee, tax_rate, discount_amount } = req.body || {};

    const checkoutOptions = { voucher_id, shipping_fee, tax_rate, discount_amount };

    Cart.checkout(userId, checkoutOptions, (err, summary) => {
      if (err) {
        const message = err.message || String(err);
        const lower = message.toLowerCase();
        const status = lower.includes('stock') || lower.includes('empty') || lower.includes('unavailable') ? 400 : 500;
        return res.status(status).json({ error: 'Checkout failed', details: message });
      }
      renderOrJson(res, 'cart/checkout-success', { message: 'Checkout complete', order: summary });
    });
  }
};

module.exports = CartController;
