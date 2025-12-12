const Voucher = require('../models/Voucher');

// Helper: try to render an EJS view; if not available, fall back to JSON.
const renderOrJson = (res, view, payload) => {
  res.render(view, payload, (err, html) => {
    if (err) {
      return res.json(payload);
    }
    res.send(html);
  });
};

// Require admin role for protected operations
const requireAdmin = (req, res) => {
  if (req.session?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return false;
  }
  return true;
};

const VoucherController = {
  // Admin: list all vouchers
  list(req, res) {
    if (!requireAdmin(req, res)) return;
    Voucher.getAll((err, vouchers) => {
      if (err) return res.status(500).json({ error: 'Failed to fetch vouchers', details: err });
      renderOrJson(res, 'vouchers/list', { vouchers });
    });
  },

  // Admin: show create form
  showCreateForm(req, res) {
    if (!requireAdmin(req, res)) return;
    renderOrJson(res, 'vouchers/create', {});
  },

  // Admin: create voucher
  create(req, res) {
    if (!requireAdmin(req, res)) return;
    const { voucher_code, discount_type, discount_value, expiry_date, usage_limit } = req.body || {};

    if (!voucher_code || !discount_type || !discount_value || !expiry_date) {
      return res.status(400).json({ error: 'voucher_code, discount_type, discount_value, and expiry_date are required' });
    }

    Voucher.create({ voucher_code, discount_type, discount_value, expiry_date, usage_limit }, (err, result) => {
      if (err) return res.status(500).json({ error: 'Failed to create voucher', details: err });
      renderOrJson(res, 'vouchers/create-success', { message: 'Voucher created', voucher_id: result?.insertId });
    });
  },

  // Admin: show edit form
  showEditForm(req, res) {
    if (!requireAdmin(req, res)) return;
    const { id } = req.params;
    Voucher.getById(id, (err, rows) => {
      if (err) return res.status(500).json({ error: 'Failed to load voucher', details: err });
      if (!rows || rows.length === 0) return res.status(404).json({ error: 'Voucher not found' });
      renderOrJson(res, 'vouchers/edit', { voucher: rows[0] });
    });
  },

  // Admin: update voucher
  update(req, res) {
    if (!requireAdmin(req, res)) return;
    const { id } = req.params;
    Voucher.update(id, req.body || {}, (err, result) => {
      if (err) return res.status(500).json({ error: 'Failed to update voucher', details: err });
      if (result?.affectedRows === 0) return res.status(404).json({ error: 'Voucher not found' });
      renderOrJson(res, 'vouchers/update-success', { message: 'Voucher updated', voucher_id: id });
    });
  },

  // Admin: delete voucher
  delete(req, res) {
    if (!requireAdmin(req, res)) return;
    const { id } = req.params;
    Voucher.delete(id, (err, result) => {
      if (err) return res.status(500).json({ error: 'Failed to delete voucher', details: err });
      if (result?.affectedRows === 0) return res.status(404).json({ error: 'Voucher not found' });
      renderOrJson(res, 'vouchers/delete-success', { message: 'Voucher deleted', voucher_id: id });
    });
  },

  // User: apply voucher code to a subtotal (no admin check)
  apply(req, res) {
    const { code, subtotal } = req.body || {};
    if (!code) return res.status(400).json({ error: 'Voucher code is required' });
    if (subtotal === undefined) return res.status(400).json({ error: 'Subtotal is required' });

    Voucher.apply(code, subtotal, (err, info) => {
      if (err) return res.status(400).json({ error: 'Failed to apply voucher', details: err.message || err });
      res.json({ voucher: info });
    });
  },

  // User: view own vouchers (visible only for adopters)
  viewMine(req, res) {
    const role = (req.session?.role || req.query?.role || '').toLowerCase();
    const isAdopter = role === 'adopter';

    // Prefer explicit arrays if provided; otherwise derive from a generic vouchers list
    const sessionVouchers = Array.isArray(req.session?.vouchers) ? req.session.vouchers : [];
    const derivedActive = sessionVouchers.filter(v => !v.used && v.status !== 'used');
    const derivedUsed = sessionVouchers.filter(v => v.used || v.status === 'used');

    const activeVouchers = isAdopter
      ? (Array.isArray(req.session?.activeVouchers) ? req.session.activeVouchers : derivedActive)
      : [];
    const usedVouchers = isAdopter
      ? (Array.isArray(req.session?.usedVouchers) ? req.session.usedVouchers : derivedUsed)
      : [];

    renderOrJson(res, 'myVoucher', {
      userRole: role || null,
      activeVouchers,
      usedVouchers
    });
  }
};

module.exports = VoucherController;
