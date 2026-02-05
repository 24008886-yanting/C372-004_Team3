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
				o.delivery_status,
				rr.refund_id,
				rr.status AS refund_status,
				rr.amount AS refund_amount,
				rr.payment_method AS refund_method,
				COALESCE(rc.rejected_count, 0) AS rejected_count,
				COALESCE(rc.total_attempts, 0) AS refund_attempts,
				COALESCE(oi.items_count, 0) AS items_count,
				COALESCE(oi.units_count, 0) AS units_count
			FROM orders o
			LEFT JOIN users u ON o.user_id = u.user_id
			LEFT JOIN vouchers v ON o.voucher_id = v.voucher_id
			LEFT JOIN (
				SELECT
					order_id,
					COUNT(order_item_id) AS items_count,
					COALESCE(SUM(quantity), 0) AS units_count
				FROM order_items
				GROUP BY order_id
			) oi ON o.order_id = oi.order_id
			LEFT JOIN (
				SELECT r1.*
				FROM refund_requests r1
				JOIN (
					SELECT order_id, MAX(created_at) AS max_created
					FROM refund_requests
					GROUP BY order_id
				) r2
				ON r1.order_id = r2.order_id AND r1.created_at = r2.max_created
			) rr ON rr.order_id = o.order_id
			LEFT JOIN (
				SELECT
					order_id,
					COUNT(*) AS total_attempts,
					SUM(CASE WHEN UPPER(status) = 'REJECTED' THEN 1 ELSE 0 END) AS rejected_count
				FROM refund_requests
				GROUP BY order_id
			) rc ON rc.order_id = o.order_id
			ORDER BY o.order_id DESC
		`;

		db.query(sql, callback);
	},
	// Update delivery status for a user's order
	setDeliveryStatus(orderId, userId, status, callback) {
		const sql = `
			UPDATE orders
			SET delivery_status = ?
			WHERE order_id = ? AND user_id = ?
		`;
		db.query(sql, [status, orderId, userId], callback);
	}
};

module.exports = Order;
