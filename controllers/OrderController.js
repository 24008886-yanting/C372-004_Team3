const Order = require('../models/Order');

const OrderController = {
	// Admin: order dashboard
	listDashboard(req, res) {
		Order.getAllWithSummary((err, orders) => {
			if (err) {
				console.error('Failed to load orders:', err);
				return res.status(500).send('Failed to load orders');
			}

			// Compute simple stats
			const totals = {
				orders: orders?.length || 0,
				revenue: 0,
				discount: 0,
				items: 0
			};

			(orders || []).forEach(o => {
				totals.revenue += Number(o.total_amount || 0);
				totals.discount += Number(o.discount_amount || 0);
				totals.items += Number(o.units_count || 0);
			});

			res.render('orderDashboard', { orders: orders || [], totals });
		});
	}
};

module.exports = OrderController;