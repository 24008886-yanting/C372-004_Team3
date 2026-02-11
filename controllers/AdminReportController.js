const Report = require('../models/Report');
const Product = require('../models/Product');

// Normalize and sanitize query params so downstream model calls are consistent.
const normalizeFilters = (query) => {
  // Empty strings become null; dates remain as trimmed strings.
  const startDate = (query.start_date || '').trim() || null;
  const endDate = (query.end_date || '').trim() || null;

  return {
    startDate,
    endDate,
    // Optional filters for payment/order status.
    paymentStatus: (query.payment_status || '').trim() || null,
    orderStatus: (query.order_status || '').trim() || null,
    // Default grouping for breakdown charts.
    groupBy: (query.group_by || 'day').trim()
  };
};

const AdminReportController = {
  async salesReport(req, res) {
    try {
      // Parse filters from the query string.
      const filters = normalizeFilters(req.query || {});
      // Fetch overall summary and time-series breakdown based on filters.
      const summary = await Report.getSalesSummary(filters);
      const breakdown = await Report.getSalesBreakdown(filters);
      // Load products for the product trend selector.
      const products = await new Promise((resolve, reject) => {
        Product.getAllProducts((err, rows) => (err ? reject(err) : resolve(rows || [])));
      });
      // Optional product-specific trend.
      const selectedProductId = Number(req.query?.product_id || 0) || null;
      let productTrend = [];
      let selectedProduct = null;

      if (selectedProductId) {
        // Fetch trend data and resolve the selected product details.
        productTrend = await Report.getProductSalesTrend(selectedProductId, filters);
        selectedProduct = products.find((p) => Number(p.product_id) === Number(selectedProductId)) || null;
      }

      // Render report page with all computed data.
      res.render('salesReport', {
        summary,
        breakdown,
        filters,
        products,
        selectedProductId,
        selectedProduct,
        productTrend
      });
    } catch (err) {
      // Fail closed with a generic message, but log details for debugging.
      console.error('Sales report error:', err);
      res.status(500).send('Failed to load sales report.');
    }
  }
};

module.exports = AdminReportController;
