const Report = require('../models/Report');
const Product = require('../models/Product');

const normalizeFilters = (query) => {
  const startDate = (query.start_date || '').trim() || null;
  const endDate = (query.end_date || '').trim() || null;

  return {
    startDate,
    endDate,
    paymentStatus: (query.payment_status || '').trim() || null,
    orderStatus: (query.order_status || '').trim() || null,
    groupBy: (query.group_by || 'day').trim()
  };
};

const AdminReportController = {
  async salesReport(req, res) {
    try {
      const filters = normalizeFilters(req.query || {});
      const summary = await Report.getSalesSummary(filters);
      const breakdown = await Report.getSalesBreakdown(filters);
      const products = await new Promise((resolve, reject) => {
        Product.getAllProducts((err, rows) => (err ? reject(err) : resolve(rows || [])));
      });
      const selectedProductId = Number(req.query?.product_id || 0) || null;
      let productTrend = [];
      let selectedProduct = null;

      if (selectedProductId) {
        productTrend = await Report.getProductSalesTrend(selectedProductId, filters);
        selectedProduct = products.find((p) => Number(p.product_id) === Number(selectedProductId)) || null;
      }

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
      console.error('Sales report error:', err);
      res.status(500).send('Failed to load sales report.');
    }
  }
};

module.exports = AdminReportController;
