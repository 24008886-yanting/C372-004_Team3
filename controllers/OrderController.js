const Order = require('../models/Order');
const RiskFlag = require('../models/RiskFlag');

const OrderController = {
	// Admin: order dashboard
	listDashboard(req, res) {
		Order.getAllWithSummary(async (err, orders) => {
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
				if (['APPROVED', 'REFUNDED'].includes(String(o.refund_status || '').toUpperCase())) {
					totals.refunds += Number(o.refund_amount || 0);
				}
			});

			const userIds = Array.from(new Set((orders || []).map(o => o.user_id).filter(Boolean)));
			let riskFlagCounts = {};
			try {
				riskFlagCounts = await RiskFlag.countByUserIds(userIds);
			} catch (flagErr) {
				console.error('Failed to load risk flag counts:', flagErr);
			}

			console.log('Order Totals Calculation:', totals, 'Orders:', orders.map(o => ({ id: o.order_id, total_amount: o.total_amount })));

			res.render('orderDashboard', { orders: orders || [], totals, riskFlagCounts });
		});
	}
};

module.exports = OrderController;
