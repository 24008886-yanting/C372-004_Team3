// Store product reviews written by users
// tie review to user_id and product_id
// optional rating (1–5)
// review text is optional
// user can only review purchased items (logic done in backend)
const db = require('../db');
const Review = require('../models/Review');

const ReviewController = {
  showAddForm(req, res) {
    const userId = req.session?.user_id;
    const orderItemId = Number(req.query.order_item_id || 0);
    if (!userId || !orderItemId) return res.redirect('/allTransactions');

    const sql = `
      SELECT oi.order_item_id, oi.order_id, oi.product_id, p.product_name, o.user_id
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.order_id
      JOIN products p ON oi.product_id = p.product_id
      WHERE oi.order_item_id = ?
    `;
    db.query(sql, [orderItemId], (err, rows) => {
      if (err || !rows || rows.length === 0) {
        req.flash('error', 'Order item not found.');
        return res.redirect('/allTransactions');
      }
      const item = rows[0];
      if (item.user_id !== userId) {
        req.flash('error', 'You can only review items you purchased.');
        return res.redirect('/allTransactions');
      }

      // check if review exists
      Review.existsForOrderItem(orderItemId, (e, exists) => {
        if (e) return res.status(500).send('Server error');
        if (exists) {
          req.flash('error', 'You already reviewed this item.');
          return res.redirect('/allTransactions');
        }
        res.render('addReview', {
          order_item: item,
          error: null
        });
      });
    });
  },

  create(req, res) {
    const userId = req.session?.user_id;
    const { order_item_id, product_id, order_id } = req.body;
    const rating = Number(req.body.rating);
    const comment = req.body.comment || null;
    if (!userId) return res.redirect('/login');
    if (!order_item_id || !product_id || !order_id) {
      req.flash('error', 'Missing review context.');
      return res.redirect('/allTransactions');
    }
    // Ensure ownership & no existing review
    const ownershipSql = `
      SELECT o.user_id
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.order_id
      WHERE oi.order_item_id = ? AND o.user_id = ?
    `;
    db.query(ownershipSql, [order_item_id, userId], (err, rows) => {
      if (err) return res.status(500).send('Server error');
      if (!rows || rows.length === 0) {
        req.flash('error', 'Order item not found or not yours.');
        return res.redirect('/allTransactions');
      }

      Review.existsForOrderItem(order_item_id, (e, exists) => {
        if (e) return res.status(500).send('Server error');
        if (exists) {
          req.flash('error', 'You have already reviewed this item.');
          return res.redirect('/allTransactions');
        }
        Review.create({
          user_id: userId,
          order_id,
          order_item_id,
          product_id,
          rating,
          comment
        }, (createErr) => {
          if (createErr) {
            console.error(createErr);
            req.flash('error', 'Failed to save review.');
            return res.redirect('/allTransactions');
          }
          req.flash('success', 'Review submitted — thanks!');
          return res.redirect('/allTransactions');
        });
      });
    });
  },

  // optional: page listing user's reviews
  listByUser(req, res) {
    const userId = req.session?.user_id;
    if (!userId) return res.redirect('/login');
    Review.getByUser(userId, (err, rows) => {
      if (err) return res.status(500).send('Server error');
      res.render('reviewList', { reviews: rows || [] });
    });
  },

  // Admin: list all reviews
  listAll(req, res) {
    const role = (req.session?.role || '').toLowerCase();
    if (role !== 'admin') return res.status(403).send('Forbidden');

    Review.getAll((err, rows) => {
      if (err) {
        console.error('Failed to load reviews:', err);
        return res.status(500).send('Failed to load reviews');
      }
      res.render('reviewList', { reviews: rows || [], isAdminView: true });
    });
  }
};

module.exports = ReviewController;