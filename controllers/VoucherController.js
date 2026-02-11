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
      // Beginner note: compute display status based on expiry date and usage count.
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

    // Beginner note: treat blank usage_limit as "no limit" instead of 0.
    const normalizedUsageLimit =
      usage_limit === undefined || usage_limit === null || String(usage_limit).trim() === ''
        ? undefined
        : Number(usage_limit);

    // Beginner note: only adopters can use vouchers in this app.
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
    // Beginner note: keep vouchers restricted to adopters even if the form is edited.
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

    // Beginner note: only logged-in adopters can apply vouchers at checkout.
    const role = (req.session?.role || req.session?.user?.role || '').toLowerCase().trim();
    const userId = req.session?.user_id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    if (role !== 'adopter') {
      return res.status(403).json({ error: 'Vouchers are only available to adopters.' });
    }

    Voucher.apply(code, subtotal, role, (err, info) => {
      if (err) {
        if (req.session) req.session.appliedVoucher = null;
        return res.status(400).json({ error: 'Failed to apply voucher', details: err.message || err });
      }
      // Beginner note: store the applied voucher in session so checkout can reuse it.
      if (req.session) {
        req.session.appliedVoucher = {
          code: info.voucher_code,
          voucher_id: info.voucher_id,
          discount_amount: info.discount_amount
        };
      }
      res.json({ voucher: info });
    });
  },

  // User: view own vouchers (visible only for adopters)
  viewMine(req, res) {
    const role = (req.session?.role || req.session?.user?.role || req.query?.role || '').toLowerCase();
    const isAdopter = role === 'adopter';
    const userId = req.session?.user_id;

    if (!isAdopter) {
      return renderOrJson(res, 'myVoucher', {
        userRole: role || null,
        activeVouchers: [],
        usedVouchers: [],
        error: 'Vouchers are only available to adopters.'
      });
    }

    if (!userId) {
      return renderOrJson(res, 'myVoucher', {
        userRole: role || null,
        activeVouchers: [],
        usedVouchers: [],
        error: 'Please log in to view your vouchers.'
      });
    }

    Voucher.getAll((err, rows) => {
      if (err) {
        return renderOrJson(res, 'myVoucher', {
          userRole: role || null,
          activeVouchers: [],
          usedVouchers: [],
          error: 'Failed to load vouchers. Please try again.'
        });
      }

      // Beginner note: split vouchers into active vs used/expired for display.
      const now = new Date();
      const activeVouchers = [];
      const usedVouchers = [];

      (rows || []).forEach((voucher) => {
        const allowedRole = String(voucher.allowed_role || '').toLowerCase();
        if (allowedRole && allowedRole !== 'adopter') return;

        const expiry = voucher.expiry_date ? new Date(voucher.expiry_date) : null;
        const isExpired = expiry ? expiry < now : false;
        const usageLimit = Number(voucher.usage_limit || 0);
        const usedCount = Number(voucher.used_count || 0);
        const isUsedUp = usageLimit > 0 && usedCount >= usageLimit;

        if (isExpired || isUsedUp) {
          usedVouchers.push(voucher);
        } else {
          activeVouchers.push(voucher);
        }
      });

      renderOrJson(res, 'myVoucher', {
        userRole: role || null,
        activeVouchers,
        usedVouchers
      });
    });
  }
};

module.exports = VoucherController;
