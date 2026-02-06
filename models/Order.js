const db = require('../db');

const TRACKING_STATUSES = ['in_warehouse', 'sorting_centre', 'enroute', 'delivered'];

const normalizeTrackingStatus = (value) => {
	let status = String(value || '').trim().toLowerCase();
	if (status === 'out_for_delivery') status = 'enroute';
	return TRACKING_STATUSES.includes(status) ? status : 'in_warehouse';
};

// Basic order model for admin dashboard and lookups
const Order = {
	TRACKING_STATUSES,
	normalizeTrackingStatus,

	ensureTrackingTable() {
		const sql = `
			CREATE TABLE IF NOT EXISTS order_tracking (
				order_id INT NOT NULL PRIMARY KEY,
				status VARCHAR(32) NOT NULL DEFAULT 'in_warehouse',
				updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
				CONSTRAINT fk_order_tracking_order
					FOREIGN KEY (order_id) REFERENCES orders(order_id)
					ON DELETE CASCADE
			)
		`;

		db.query(sql, (err) => {
			if (err) {
				console.error('Failed to ensure order_tracking table exists:', err.message);
			}
		});
	},

	setInitialTrackingStatus(orderId, callback) {
		const sql = `
			INSERT INTO order_tracking (order_id, status)
			VALUES (?, 'in_warehouse')
			ON DUPLICATE KEY UPDATE status = status
		`;
		db.query(sql, [orderId], callback);
	},

	setTrackingStatus(orderId, status, callback) {
		const normalizedStatus = normalizeTrackingStatus(status);
		const sql = `
			INSERT INTO order_tracking (order_id, status)
			VALUES (?, ?)
			ON DUPLICATE KEY UPDATE status = VALUES(status), updated_at = CURRENT_TIMESTAMP
		`;
		db.query(sql, [orderId, normalizedStatus], callback);
	},

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
				o.payment_status,
				tx.payment_method AS payment_method,
				rr.refund_id,
				rr.status AS refund_status,
				rr.amount AS refund_amount,					rr.reason AS refund_reason,
					rr.refund_items AS refund_items,
				rr.created_at AS refund_created_at,
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
				SELECT t1.*
				FROM transactions t1
				JOIN (
					SELECT order_id, MAX(transaction_time) AS max_time
					FROM transactions
					GROUP BY order_id
				) t2
				ON t1.order_id = t2.order_id AND t1.transaction_time = t2.max_time
			) tx ON tx.order_id = o.order_id
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
	// Tracking data for paid orders
	getTrackingByUser(userId, callback) {
		const sql = `
			SELECT
				o.order_id,
				o.total_amount,
				o.payment_status,
				COALESCE(ot.status, 'in_warehouse') AS tracking_status,
				COALESCE(ot.updated_at, o.order_date) AS tracking_updated_at,
				COALESCE(oi.units_count, 0) AS units_count
			FROM orders o
			LEFT JOIN order_tracking ot ON o.order_id = ot.order_id
			LEFT JOIN (
				SELECT
					order_id,
					COALESCE(SUM(quantity), 0) AS units_count
				FROM order_items
				GROUP BY order_id
			) oi ON o.order_id = oi.order_id
			WHERE o.user_id = ?
				AND UPPER(COALESCE(o.payment_status, '')) IN ('PAID', 'COMPLETED', 'SUCCESS', 'APPROVED')
			ORDER BY o.order_id DESC
		`;

		db.query(sql, [userId], callback);
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
