const db = require('../db');

const SUCCESS_STATUSES = ['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'PAID', 'APPROVED'];
const SUCCESS_PLACEHOLDERS = SUCCESS_STATUSES.map(() => '?').join(', ');

const GST_RATE = 0.09;
const netOfGst = (amount) => {
  const value = Number(amount || 0);
  return value / (1 + GST_RATE);
};

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

const buildOrderFilters = (filters) => {
  const parts = [];
  const params = [];

  if (filters.startDate) {
    parts.push('o.order_date >= ?');
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    parts.push('o.order_date < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(filters.endDate);
  }
  if (filters.paymentStatus) {
    parts.push('UPPER(o.payment_status) = ?');
    params.push(String(filters.paymentStatus).toUpperCase());
  }
  if (filters.orderStatus) {
    parts.push('UPPER(o.delivery_status) = ?');
    params.push(String(filters.orderStatus).toUpperCase());
  }

  const whereSql = parts.length ? `WHERE ${parts.join(' AND ')}` : '';
  return { whereSql, params };
};

const buildDateFilter = (column, filters, params) => {
  const parts = [];
  if (filters.startDate) {
    parts.push(`${column} >= ?`);
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    parts.push(`${column} < DATE_ADD(?, INTERVAL 1 DAY)`);
    params.push(filters.endDate);
  }
  return parts.length ? ` AND ${parts.join(' AND ')}` : '';
};

const latestTxnSql = `
  SELECT t1.*
  FROM transactions t1
  JOIN (
    SELECT order_id, MAX(transaction_time) AS max_time
    FROM transactions
    GROUP BY order_id
  ) t2
    ON t1.order_id = t2.order_id
   AND t1.transaction_time = t2.max_time
`;

const pad2 = (num) => String(num).padStart(2, '0');

const normalizeDateKey = (value, groupBy = 'day') => {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = pad2(value.getMonth() + 1);
    const day = pad2(value.getDate());
    if (groupBy === 'hour') {
      const hour = pad2(value.getHours());
      return `${year}-${month}-${day} ${hour}:00`;
    }
    if (groupBy === 'month') return `${year}-${month}`;
    return `${year}-${month}-${day}`;
  }
  const raw = String(value);
  if (groupBy === 'hour') {
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2})/);
    if (match) return `${match[1]} ${match[2]}:00`;
  }
  if (groupBy === 'month') {
    if (/^\d{4}-\d{2}/.test(raw)) return raw.slice(0, 7);
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return raw;
};

const resolveRefundItems = async (rows, groupBy = 'day') => {
  const refundItems = [];
  const orderItemIds = new Set();

  (rows || []).forEach((row) => {
    const dayKey = normalizeDateKey(row.day, groupBy);
    let items = [];
    if (row.refund_items) {
      try {
        const parsed = JSON.parse(row.refund_items);
        if (Array.isArray(parsed)) items = parsed;
      } catch (err) {
        items = [];
      }
    }
    if (!items.length && row.order_item_id) {
      items = [
        {
          order_item_id: row.order_item_id,
          qty: Number(row.refund_qty || 0),
          line_refund: null
        }
      ];
    }
    items.forEach((item) => {
      const itemId = Number(item.order_item_id || item.orderItemId || item.id || 0);
      if (!itemId) return;
      orderItemIds.add(itemId);
      refundItems.push({
        day: dayKey,
        order_item_id: itemId,
        qty: Number(item.qty ?? item.quantity ?? 0),
        line_refund: item.line_refund != null ? Number(item.line_refund) : null
      });
    });
  });

  let orderItemMap = new Map();
  if (orderItemIds.size > 0) {
    const idList = Array.from(orderItemIds);
    const itemRows = await query(
      `
      SELECT
        oi.order_item_id,
        oi.product_id,
        oi.quantity,
        oi.item_total,
        o.subtotal AS order_subtotal,
        o.discount_amount AS order_discount
      FROM order_items oi
      JOIN orders o ON o.order_id = oi.order_id
      WHERE oi.order_item_id IN (?)
      `,
      [idList]
    );
    orderItemMap = new Map(
      (itemRows || []).map((row) => [Number(row.order_item_id), row])
    );
  }

  return { refundItems, orderItemMap };
};

const Report = {
  async getDashboardSummary(filters) {
    const { whereSql, params } = buildOrderFilters(filters);

    const orderRows = await query(
      `
      SELECT
        COUNT(*) AS total_orders,
        SUM(CASE WHEN UPPER(o.payment_status) IN ('PAID','COMPLETED','SUCCESS') THEN 1 ELSE 0 END) AS paid_orders,
        SUM(CASE WHEN UPPER(o.delivery_status) IN ('DELIVERED','COMPLETED') THEN 1 ELSE 0 END) AS delivered_orders
      FROM orders o
      ${whereSql}
      `,
      params
    );

    const refundParams = [];
    let refundWhere = 'WHERE 1=1';
    refundWhere += buildDateFilter('COALESCE(r.approved_at, r.created_at)', filters, refundParams);

    const refundRows = await query(
      `
      SELECT
        SUM(CASE WHEN UPPER(r.status) = 'PENDING' THEN 1 ELSE 0 END) AS pending_refunds,
        SUM(CASE WHEN UPPER(r.status) IN ('APPROVED','REFUNDED') THEN 1 ELSE 0 END) AS approved_refunds
      FROM refund_requests r
      ${refundWhere}
      `,
      refundParams
    );

    return {
      totalOrders: Number(orderRows?.[0]?.total_orders || 0),
      paidOrders: Number(orderRows?.[0]?.paid_orders || 0),
      deliveredOrders: Number(orderRows?.[0]?.delivered_orders || 0),
      pendingRefunds: Number(refundRows?.[0]?.pending_refunds || 0),
      approvedRefunds: Number(refundRows?.[0]?.approved_refunds || 0)
    };
  },

  async getRecentOrders(filters, { limit = 20 } = {}) {
    const { whereSql, params } = buildOrderFilters(filters);
    const sql = `
      SELECT
        o.order_id,
        o.user_id,
        u.username,
        o.total_amount,
        o.payment_status,
        o.delivery_status AS order_status,
        o.order_date AS created_at
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.user_id
      ${whereSql}
      ORDER BY o.created_at DESC, o.order_id DESC
      LIMIT ?
    `;
    const rows = await query(sql, [...params, limit]);
    return rows || [];
  },

  async getSalesSummary(filters) {
    const txnParams = [...SUCCESS_STATUSES];
    let txnWhere = `WHERE t.order_id IS NOT NULL AND UPPER(t.status) IN (${SUCCESS_PLACEHOLDERS})`;
    txnWhere += buildDateFilter('t.transaction_time', filters, txnParams);

    const salesRows = await query(
      `
      SELECT
        COALESCE(SUM(GREATEST(o.subtotal - COALESCE(o.discount_amount, 0), 0)), 0) AS gross_sales_items,
        COUNT(DISTINCT o.order_id) AS total_orders
      FROM orders o
      JOIN (${latestTxnSql}) t ON t.order_id = o.order_id
      ${txnWhere}
      `,
      txnParams
    );

    const itemsParams = [...SUCCESS_STATUSES];
    let itemsWhere = `WHERE UPPER(t.status) IN (${SUCCESS_PLACEHOLDERS})`;
    itemsWhere += buildDateFilter('t.transaction_time', filters, itemsParams);

    const itemRows = await query(
      `
      SELECT COALESCE(SUM(oi.quantity), 0) AS total_items_sold
      FROM order_items oi
      JOIN (${latestTxnSql}) t ON t.order_id = oi.order_id
      ${itemsWhere}
      `,
      itemsParams
    );

    const refundParams = [];
    let refundWhere = `WHERE UPPER(r.status) IN ('APPROVED','REFUNDED')`;
    refundWhere += buildDateFilter('COALESCE(r.approved_at, r.created_at)', filters, refundParams);

    const refundRows = await query(
      `
      SELECT
        r.refund_id,
        r.order_item_id,
        r.refund_qty,
        r.refund_items,
        r.amount,
        r.created_at,
        r.approved_at,
        DATE(COALESCE(r.approved_at, r.created_at)) AS day
      FROM refund_requests r
      ${refundWhere}
      `,
      refundParams
    );

    const { refundItems, orderItemMap } = await resolveRefundItems(refundRows, 'day');
    let refundsGross = 0;
    refundItems.forEach((item) => {
      const row = orderItemMap.get(Number(item.order_item_id));
      if (!row) return;
      const qty = Math.max(Number(item.qty || 0), 0);
      if (!qty) return;
      let lineRefund = Number(item.line_refund || 0);
      if (!lineRefund && row.quantity) {
        const orderSubtotal = Number(row.order_subtotal || 0);
        const orderDiscount = Math.max(Number(row.order_discount || 0), 0);
        const discountShare = orderSubtotal > 0 ? (orderDiscount * (Number(row.item_total || 0) / orderSubtotal)) : 0;
        const discountedItemTotal = Math.max(Number(row.item_total || 0) - discountShare, 0);
        const unit = discountedItemTotal / Math.max(Number(row.quantity || 1), 1);
        lineRefund = unit * qty;
      }
      refundsGross += Number(lineRefund || 0);
    });

    const grossSales = netOfGst(Number(salesRows?.[0]?.gross_sales_items || 0));
    const refundsTotal = netOfGst(refundsGross);

    return {
      grossSales,
      refundsTotal,
      netSales: grossSales - refundsTotal,
      totalOrders: Number(salesRows?.[0]?.total_orders || 0),
      totalItemsSold: Number(itemRows?.[0]?.total_items_sold || 0)
    };
  },

  async getSalesBreakdown(filters) {
    const groupBy = (filters.groupBy || 'day').toLowerCase() === 'month' ? 'month' : 'day';
    const txnGroupExpr = groupBy === 'month'
      ? "DATE_FORMAT(t.transaction_time, '%Y-%m')"
      : 'DATE(t.transaction_time)';

    const txnParams = [...SUCCESS_STATUSES];
    let txnWhere = `WHERE t.order_id IS NOT NULL AND UPPER(t.status) IN (${SUCCESS_PLACEHOLDERS})`;
    txnWhere += buildDateFilter('t.transaction_time', filters, txnParams);

    const refundParams = [];
    let refundWhere = `WHERE UPPER(r.status) IN ('APPROVED','REFUNDED')`;
    refundWhere += buildDateFilter('COALESCE(r.approved_at, r.created_at)', filters, refundParams);

    const salesRows = await query(
      `
      SELECT
        ${txnGroupExpr} AS day,
        COALESCE(SUM(GREATEST(o.subtotal - COALESCE(o.discount_amount, 0), 0)), 0) AS gross_sales_items,
        COUNT(DISTINCT o.order_id) AS order_count
      FROM orders o
      JOIN (${latestTxnSql}) t ON t.order_id = o.order_id
      ${txnWhere}
      GROUP BY day
      `,
      txnParams
    );

    const refundRows = await query(
      `
      SELECT
        r.refund_id,
        r.order_item_id,
        r.refund_qty,
        r.refund_items,
        r.amount,
        r.created_at,
        r.approved_at,
        ${groupBy === 'month'
          ? "DATE_FORMAT(COALESCE(r.approved_at, r.created_at), '%Y-%m')"
          : 'DATE(COALESCE(r.approved_at, r.created_at))'} AS day
      FROM refund_requests r
      ${refundWhere}
      `,
      refundParams
    );

    const { refundItems, orderItemMap } = await resolveRefundItems(refundRows, groupBy);
    const refundTotals = new Map();
    refundItems.forEach((item) => {
      const row = orderItemMap.get(Number(item.order_item_id));
      if (!row) return;
      const qty = Math.max(Number(item.qty || 0), 0);
      if (!qty) return;
      let lineRefund = Number(item.line_refund || 0);
      if (!lineRefund && row.quantity) {
        const orderSubtotal = Number(row.order_subtotal || 0);
        const orderDiscount = Math.max(Number(row.order_discount || 0), 0);
        const discountShare = orderSubtotal > 0 ? (orderDiscount * (Number(row.item_total || 0) / orderSubtotal)) : 0;
        const discountedItemTotal = Math.max(Number(row.item_total || 0) - discountShare, 0);
        const unit = discountedItemTotal / Math.max(Number(row.quantity || 1), 1);
        lineRefund = unit * qty;
      }
      const dayKey = normalizeDateKey(item.day, groupBy) || 'Unknown';
      refundTotals.set(dayKey, (refundTotals.get(dayKey) || 0) + Number(lineRefund || 0));
    });

    const merged = new Map();
    (salesRows || []).forEach((row) => {
      const dayKey = normalizeDateKey(row.day, groupBy) || 'Unknown';
      merged.set(dayKey, {
        day: dayKey,
        gross_sales: netOfGst(Number(row.gross_sales_items || 0)),
        refunds_total: 0,
        order_count: Number(row.order_count || 0)
      });
    });

    refundTotals.forEach((value, dayKey) => {
      const existing = merged.get(dayKey) || {
        day: dayKey,
        gross_sales: 0,
        refunds_total: 0,
        order_count: 0
      };
      existing.refunds_total += netOfGst(Number(value || 0));
      merged.set(dayKey, existing);
    });

    const rows = Array.from(merged.values()).map((row) => ({
      ...row,
      net_sales: Number(row.gross_sales || 0) - Number(row.refunds_total || 0)
    }));

    rows.sort((a, b) => String(b.day).localeCompare(String(a.day)));
    return rows;
  },

  async getProductSalesTrend(productId, filters) {
    if (!productId) return [];

    const trendBy = 'hour';
    const txnGroupExpr = trendBy === 'hour'
      ? "DATE_FORMAT(t.transaction_time, '%Y-%m-%d %H:00')"
      : 'DATE(t.transaction_time)';
    const normalizeDayKey = (value) => normalizeDateKey(value, 'hour');

    const salesParams = [productId, ...SUCCESS_STATUSES];
    let salesWhere = `WHERE oi.product_id = ? AND t.order_id IS NOT NULL AND UPPER(t.status) IN (${SUCCESS_PLACEHOLDERS})`;
    salesWhere += buildDateFilter('t.transaction_time', filters, salesParams);

    const salesRows = await query(
      `
      SELECT
        ${txnGroupExpr} AS day,
        COALESCE(SUM(oi.quantity), 0) AS units_sold,
        COALESCE(
          SUM(
            GREATEST(
              oi.item_total - (COALESCE(o.discount_amount, 0) * oi.item_total / NULLIF(o.subtotal, 0)),
              0
            )
          ),
          0
        ) AS gross_sales
      FROM order_items oi
      JOIN orders o ON o.order_id = oi.order_id
      JOIN (${latestTxnSql}) t ON t.order_id = oi.order_id
      ${salesWhere}
      GROUP BY day
      ORDER BY day DESC
      `,
      salesParams
    );

    const refundDateExpr = trendBy === 'hour'
      ? "DATE_FORMAT(COALESCE(r.approved_at, r.created_at), '%Y-%m-%d %H:00')"
      : 'DATE(COALESCE(r.approved_at, r.created_at))';
    const refundParams = [];
    let refundWhere = `WHERE UPPER(r.status) IN ('APPROVED','REFUNDED')`;
    refundWhere += buildDateFilter('COALESCE(r.approved_at, r.created_at)', filters, refundParams);

    const refundRows = await query(
      `
      SELECT
        r.refund_id,
        r.order_item_id,
        r.refund_qty,
        r.refund_items,
        r.amount,
        r.created_at,
        r.approved_at,
        ${refundDateExpr} AS day
      FROM refund_requests r
      ${refundWhere}
      `,
      refundParams
    );

    const { refundItems, orderItemMap } = await resolveRefundItems(refundRows, 'hour');

    const refundTotals = new Map();
    refundItems.forEach((item) => {
      const row = orderItemMap.get(Number(item.order_item_id));
      if (!row) return;
      if (Number(row.product_id) !== Number(productId)) return;
      const qty = Math.max(Number(item.qty || 0), 0);
      if (!qty) return;

      let lineRefund = Number(item.line_refund || 0);
      if (!lineRefund && row.quantity) {
        const orderSubtotal = Number(row.order_subtotal || 0);
        const orderDiscount = Math.max(Number(row.order_discount || 0), 0);
        const discountShare = orderSubtotal > 0 ? (orderDiscount * (Number(row.item_total || 0) / orderSubtotal)) : 0;
        const discountedItemTotal = Math.max(Number(row.item_total || 0) - discountShare, 0);
        const unit = discountedItemTotal / Math.max(Number(row.quantity || 1), 1);
        lineRefund = unit * qty;
      }
      const dayKey = normalizeDayKey(item.day) || 'Unknown';
      const current = refundTotals.get(dayKey) || { refunds_total: 0, refunded_units: 0 };
      current.refunds_total += Number(lineRefund || 0);
      current.refunded_units += qty;
      refundTotals.set(dayKey, current);
    });

    const merged = new Map();
    (salesRows || []).forEach((row) => {
      const dayKey = normalizeDayKey(row.day) || 'Unknown';
      merged.set(dayKey, {
        day: dayKey,
        units_sold: Number(row.units_sold || 0),
        gross_sales: netOfGst(Number(row.gross_sales || 0)),
        refunded_units: 0,
        refunds_total: 0
      });
    });

    refundTotals.forEach((value, dayKey) => {
      const existing = merged.get(dayKey) || {
        day: dayKey,
        units_sold: 0,
        gross_sales: 0,
        refunded_units: 0,
        refunds_total: 0
      };
      existing.refunded_units += Number(value.refunded_units || 0);
      existing.refunds_total += netOfGst(Number(value.refunds_total || 0));
      merged.set(dayKey, existing);
    });

    const mergedRows = Array.from(merged.values()).map((row) => {
      const netSales = Number(row.gross_sales || 0) - Number(row.refunds_total || 0);
      const netUnits = Number(row.units_sold || 0) - Number(row.refunded_units || 0);
      return {
        day: row.day,
        units_sold: Number(row.units_sold || 0),
        refunded_units: Number(row.refunded_units || 0),
        net_units: netUnits,
        gross_sales: Number(row.gross_sales || 0),
        refunds_total: Number(row.refunds_total || 0),
        net_sales: netSales
      };
    });

    mergedRows.sort((a, b) => String(b.day).localeCompare(String(a.day)));
    return mergedRows;
  }
};

module.exports = Report;
