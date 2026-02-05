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
				items: 0,
				refunds: 0
			};

			(orders || []).forEach(o => {
				const amount = Number(o.total_amount || 0);
				totals.revenue += amount;
				totals.discount += Number(o.discount_amount || 0);
				totals.items += Number(o.units_count || 0);
				if (String(o.refund_status || '').toUpperCase() === 'REFUNDED') {
					totals.refunds += Number(o.refund_amount || 0);
				}
			});

			console.log('Order Totals Calculation:', totals, 'Orders:', orders.map(o => ({ id: o.order_id, total_amount: o.total_amount })));

			res.render('orderDashboard', { orders: orders || [], totals });
		});
	}
};

module.exports = OrderController;
