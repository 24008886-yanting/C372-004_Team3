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
  const role = (req.session?.role || '').toLowerCase();
  if (role !== 'admin') {
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
      const now = new Date();
      const mapped = (vouchers || []).map(v => {
        const expiry = v.expiry_date ? new Date(v.expiry_date) : null;
        const isExpired = expiry ? expiry < now : false;
        const usageLimit = Number(v.usage_limit ?? 0);
        const used = Number(v.used_count ?? 0);
        const isDepleted = usageLimit > 0 && used >= usageLimit;
        let status = 'Active';
        let statusReason = '';
        if (isExpired) {
          status = 'Expired';
          statusReason = 'Past expiry date';
        } else if (isDepleted) {
          status = 'Used Up';
          statusReason = 'Usage limit reached';
        }
        return { ...v, status, statusReason };
      });

      return res.render('vouchers', { vouchers: mapped });
    });
  },

  // Admin: show create form
  showCreateForm(req, res) {
    if (!requireAdmin(req, res)) return;
    renderOrJson(res, 'createVoucher', {});
  },

  // Admin: create voucher
  create(req, res) {
    if (!requireAdmin(req, res)) return;
    const { voucher_code, description, discount_type, discount_value, expiry_date, usage_limit } = req.body || {};

    if (!voucher_code || !discount_type || !discount_value || !expiry_date) {
      return res.status(400).json({ error: 'voucher_code, discount_type, discount_value, and expiry_date are required' });
    }

    const normalizedUsageLimit =
      usage_limit === undefined || usage_limit === null || String(usage_limit).trim() === ''
        ? undefined
        : Number(usage_limit);

    const allowedRole = 'adopter';

    Voucher.create(
      {
        voucher_code,
        description,
        allowed_role: allowedRole,
        discount_type,
        discount_value,
        expiry_date,
        usage_limit: normalizedUsageLimit
      },
      (err, result) => {
      if (err) return res.status(500).json({ error: 'Failed to create voucher', details: err });
      renderOrJson(res, 'createVoucherSuccess', { message: 'Voucher created', voucher_id: result?.insertId });
    });
  },

  // Admin: show edit form
  showEditForm(req, res) {
    if (!requireAdmin(req, res)) return;
    const { id } = req.params;
    Voucher.getById(id, (err, rows) => {
      if (err) return res.status(500).json({ error: 'Failed to load voucher', details: err });
      if (!rows || rows.length === 0) return res.status(404).json({ error: 'Voucher not found' });
      renderOrJson(res, 'editVoucher', { voucher: rows[0] });
    });
  },

  // Admin: update voucher
  update(req, res) {
    if (!requireAdmin(req, res)) return;
    const { id } = req.params;
    const updates = { ...(req.body || {}) };
    if (updates.allowed_role && String(updates.allowed_role).toLowerCase() !== 'adopter') {
      updates.allowed_role = 'adopter';
    }
    if (updates.usage_limit !== undefined && String(updates.usage_limit).trim() === '') {
      delete updates.usage_limit;
    }
    Voucher.update(id, updates, (err, result) => {
      if (err) return res.status(500).json({ error: 'Failed to update voucher', details: err });
      if (result?.affectedRows === 0) return res.status(404).json({ error: 'Voucher not found' });
      renderOrJson(res, 'updateVoucherSuccess', { message: 'Voucher updated', voucher_id: id });
    });
  },

  // Admin: delete voucher
  delete(req, res) {
    if (!requireAdmin(req, res)) return;
    const { id } = req.params;
    Voucher.delete(id, (err, result) => {
      if (err) return res.status(500).json({ error: 'Failed to delete voucher', details: err });
      if (result?.affectedRows === 0) return res.status(404).json({ error: 'Voucher not found' });
      renderOrJson(res, 'deleteVoucherSuccess', { message: 'Voucher deleted', voucher_id: id });
    });
  },

  // User: apply voucher code to a subtotal (no admin check)
  apply(req, res) {
    const { code, subtotal } = req.body || {};
    if (!code) return res.status(400).json({ error: 'Voucher code is required' });
    if (subtotal === undefined) return res.status(400).json({ error: 'Subtotal is required' });

    const role = (req.session?.role || req.session?.user?.role || '').toLowerCase().trim();
    Voucher.apply(code, subtotal, role, (err, info) => {
      if (err) return res.status(400).json({ error: 'Failed to apply voucher', details: err.message || err });
      res.json({ voucher: info });
    });
  },

  // User: view own vouchers (visible only for adopters)
  viewMine(req, res) {
    const role = (req.session?.role || req.query?.role || '').toLowerCase();
    const isAdopter = role === 'adopter';

    if (!isAdopter) {
      return renderOrJson(res, 'myVoucher', {
        userRole: role || null,
        activeVouchers: [],
        usedVouchers: [],
        error: 'Vouchers are only available to adopters.'
      });
    }

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
