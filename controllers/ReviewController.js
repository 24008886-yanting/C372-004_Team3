const db = require('../db');
const Review = require('../models/Review');

const COMPLETED_STATUS = 'COMPLETED';

const fetchCompletedPurchase = (userId, orderId, productId, callback) => {
  // NOTE: If transactions.user_id exists in your schema, filter on t.user_id instead of o.user_id.
  const sql = `
    SELECT oi.product_id, o.order_id, p.product_name
    FROM transactions t
    JOIN orders o ON t.order_id = o.order_id
    JOIN order_items oi ON o.order_id = oi.order_id
    LEFT JOIN products p ON oi.product_id = p.product_id
    WHERE o.order_id = ?
      AND oi.product_id = ?
      AND o.user_id = ?
      AND t.status = ?
    LIMIT 1
  `;

  db.query(sql, [orderId, productId, userId, COMPLETED_STATUS], (err, rows) => {
    if (err) return callback(err);
    return callback(null, rows && rows.length ? rows[0] : null);
  });
};

const renderForm = (res, data) => {
  res.render('reviewForm', {
    productId: data.productId,
    orderId: data.orderId,
    productName: data.productName || '',
    rating: data.rating ?? '',
    reviewText: data.reviewText ?? '',
    error: data.error || null,
    allowed: data.allowed !== false,
    alreadyReviewed: Boolean(data.alreadyReviewed)
  });
};

const ReviewController = {
  showReviewForm(req, res) {
    const userId = req.session?.user_id;
    const orderId = Number(req.params?.orderId || req.query?.order_id || 0);
    const productId = Number(req.params?.productId || req.query?.product_id || 0);

    if (!userId) return res.redirect('/login');
    if (!orderId || !productId) return res.redirect('/allTransactions');

    Review.getReviewByUserAndProduct(userId, productId, orderId, (err, existingReview) => {
      if (err) {
        console.error('Review lookup failed:', err);
        return res.status(500).send('Server error');
      }

      if (existingReview) {
        return renderForm(res, {
          productId,
          orderId,
          productName: existingReview.product_name || '',
          rating: existingReview.rating,
          reviewText: existingReview.review_text || '',
          error: 'You have already reviewed this product.',
          allowed: false,
          alreadyReviewed: true
        });
      }

      fetchCompletedPurchase(userId, orderId, productId, (purchaseErr, purchase) => {
        if (purchaseErr) {
          console.error('Purchase lookup failed:', purchaseErr);
          return res.status(500).send('Server error');
        }

        if (!purchase) {
          return renderForm(res, {
            productId,
            orderId,
            error: 'You can only review products from completed transactions.',
            allowed: false
          });
        }

        return renderForm(res, {
          productId,
          orderId,
          productName: purchase.product_name || '',
          rating: '',
          reviewText: '',
          error: null,
          allowed: true,
          alreadyReviewed: false
        });
      });
    });
  },

  createReview(req, res) {
    const userId = req.session?.user_id;
    const orderId = Number(req.params?.orderId || req.body?.order_id || 0);
    const productId = Number(req.params?.productId || req.body?.product_id || 0);
    const rating = Number(req.body?.rating || 0);
    const reviewText = String(req.body?.review_text || '').trim();

    if (!userId) return res.redirect('/login');
    if (!orderId || !productId) return res.redirect('/allTransactions');

    Review.getReviewByUserAndProduct(userId, productId, orderId, (err, existingReview) => {
      if (err) {
        console.error('Review lookup failed:', err);
        return res.status(500).send('Server error');
      }

      if (existingReview) {
        return renderForm(res, {
          productId,
          orderId,
          productName: existingReview.product_name || '',
          rating: existingReview.rating,
          reviewText: existingReview.review_text || '',
          error: 'You have already reviewed this product.',
          allowed: false,
          alreadyReviewed: true
        });
      }

      fetchCompletedPurchase(userId, orderId, productId, (purchaseErr, purchase) => {
        if (purchaseErr) {
          console.error('Purchase lookup failed:', purchaseErr);
          return res.status(500).send('Server error');
        }

        if (!purchase) {
          return renderForm(res, {
            productId,
            orderId,
            error: 'You can only review products from completed transactions.',
            allowed: false
          });
        }

        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
          return renderForm(res, {
            productId,
            orderId,
            productName: purchase.product_name || '',
            rating: req.body?.rating || '',
            reviewText,
            error: 'Rating must be between 1 and 5.',
            allowed: true
          });
        }

        if (!reviewText) {
          return renderForm(res, {
            productId,
            orderId,
            productName: purchase.product_name || '',
            rating,
            reviewText,
            error: 'Review text cannot be empty.',
            allowed: true
          });
        }

        Review.createReview(userId, productId, orderId, rating, reviewText, (createErr) => {
          if (createErr) {
            console.error('Failed to create review:', createErr);
            return renderForm(res, {
              productId,
              orderId,
              productName: purchase.product_name || '',
              rating,
              reviewText,
              error: 'Failed to save review. Please try again.',
              allowed: true
            });
          }

          return res.redirect('/allTransactions');
        });
      });
    });
  },

  listByUser(req, res) {
    const userId = req.session?.user_id;
    if (!userId) return res.redirect('/login');

    Review.getReviewsByUser(userId, (err, rows) => {
      if (err) {
        console.error('Failed to load user reviews:', err);
        return res.status(500).send('Server error');
      }
      res.render('reviewList', { reviews: rows || [], isAdminView: false });
    });
  },

  listAll(req, res) {
    const role = (req.session?.role || req.session?.user?.role || '').toLowerCase();
    if (role !== 'admin') return res.status(403).send('Forbidden');

    Review.getAllReviews((err, rows) => {
      if (err) {
        console.error('Failed to load reviews:', err);
        return res.status(500).send('Failed to load reviews');
      }
      res.render('adminReviews', { reviews: rows || [] });
    });
  },

  deleteReview(req, res) {
    const role = (req.session?.role || req.session?.user?.role || '').toLowerCase();
    if (role !== 'admin') return res.status(403).send('Forbidden');

    const reviewId = Number(req.params?.reviewId || 0);
    if (!reviewId) return res.redirect('/admin/reviews');

    Review.deleteReview(reviewId, (err) => {
      if (err) {
        console.error('Failed to delete review:', err);
        return res.status(500).send('Failed to delete review');
      }
      return res.redirect('/admin/reviews');
    });
  }
};

module.exports = ReviewController;
