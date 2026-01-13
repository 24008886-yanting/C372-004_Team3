const db = require('../db');

// Basic order model for admin dashboard and lookups
const Order = {
	// Admin: fetch orders with aggregates
	getAllWithSummary(callback) {
		const sql = `
			SELECT
				o.order_id,
				o.user_id,
				u.username,
				u.email,
				o.voucher_id,
				v.voucher_code,
				o.subtotal,
				o.discount_amount,
				o.shipping_fee,
				o.tax_amount,
				o.total_amount,
				COUNT(oi.order_item_id) AS items_count,
				COALESCE(SUM(oi.quantity), 0) AS units_count
			FROM orders o
			LEFT JOIN users u ON o.user_id = u.user_id
			LEFT JOIN vouchers v ON o.voucher_id = v.voucher_id
			LEFT JOIN order_items oi ON o.order_id = oi.order_id
			GROUP BY o.order_id
			ORDER BY o.order_id DESC
		`;

		db.query(sql, callback);
	}
};

module.exports = Order;
