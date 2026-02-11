const db = require('../db');

const VoucherModel = {
  // Beginner note: this model handles voucher CRUD and validation against the vouchers table.
  // Fetch all vouchers
  getAll(callback) {
    const sql = `
      SELECT voucher_id, voucher_code, description, allowed_role, discount_type, discount_value, expiry_date, usage_limit, used_count
      FROM vouchers
      ORDER BY expiry_date DESC
    `;
    db.query(sql, callback);
  },

  // Fetch single voucher by ID
  getById(voucherId, callback) {
    const sql = `
      SELECT voucher_id, voucher_code, description, allowed_role, discount_type, discount_value, expiry_date, usage_limit, used_count
      FROM vouchers
      WHERE voucher_id = ?
    `;
    db.query(sql, [voucherId], callback);
  },

  // Fetch voucher by code (case-insensitive)
  getByCode(code, callback) {
    const sql = `
      SELECT voucher_id, voucher_code, description, allowed_role, discount_type, discount_value, expiry_date, usage_limit, used_count
      FROM vouchers
      WHERE LOWER(voucher_code) = LOWER(?)
    `;
    db.query(sql, [code], callback);
  },

  // Create a new voucher
  create(voucherData, callback) {
    const { voucher_code, description, allowed_role = 'adopter', discount_type, discount_value, expiry_date, usage_limit = 1 } = voucherData;
    const sql = `
      INSERT INTO vouchers (voucher_code, description, allowed_role, discount_type, discount_value, expiry_date, usage_limit)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [voucher_code, description, allowed_role, discount_type, discount_value, expiry_date, usage_limit];
    db.query(sql, params, callback);
  },

  // Update an existing voucher
  update(voucherId, updates, callback) {
    const fields = [];
    const params = [];

    if (updates.voucher_code !== undefined) {
      fields.push('voucher_code = ?');
      params.push(updates.voucher_code);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      params.push(updates.description);
    }
    if (updates.allowed_role !== undefined) {
      fields.push('allowed_role = ?');
      params.push(updates.allowed_role);
    }
    if (updates.discount_type !== undefined) {
      fields.push('discount_type = ?');
      params.push(updates.discount_type);
    }
    if (updates.discount_value !== undefined) {
      fields.push('discount_value = ?');
      params.push(updates.discount_value);
    }
    if (updates.expiry_date !== undefined) {
      fields.push('expiry_date = ?');
      params.push(updates.expiry_date);
    }
    if (updates.usage_limit !== undefined) {
      fields.push('usage_limit = ?');
      params.push(updates.usage_limit);
    }
    if (updates.used_count !== undefined) {
      fields.push('used_count = ?');
      params.push(updates.used_count);
    }

    if (!fields.length) {
      return callback(new Error('No fields to update'));
    }

    const sql = `UPDATE vouchers SET ${fields.join(', ')} WHERE voucher_id = ?`;
    params.push(voucherId);
    db.query(sql, params, callback);
  },

  // Delete a voucher
  delete(voucherId, callback) {
    const sql = 'DELETE FROM vouchers WHERE voucher_id = ?';
    db.query(sql, [voucherId], callback);
  },

  // Beginner note: apply() only validates and calculates the discount.
  // It does NOT mark the voucher as used (used_count is updated after checkout).
  // Apply voucher code to a subtotal; validates expiry, role, and usage limit
  apply(code, subtotal, role, callback) {
    if (typeof role === 'function') {
      callback = role;
      role = null;
    }
    const numericSubtotal = Number(subtotal);
    if (Number.isNaN(numericSubtotal) || numericSubtotal < 0) {
      return callback(new Error('Invalid subtotal'));
    }

    this.getByCode(code, (err, rows) => {
      if (err) return callback(err);
      if (!rows || rows.length === 0) return callback(new Error('Voucher not found'));

      const voucher = rows[0];
      const now = new Date();
      const expiry = new Date(voucher.expiry_date);

      if (voucher.allowed_role && role) {
        const allowed = String(voucher.allowed_role).toLowerCase();
        const userRole = String(role).toLowerCase();
        if (allowed && userRole && allowed !== userRole) {
          return callback(new Error('Voucher not available for this account'));
        }
      }

      if (expiry < now) return callback(new Error('Voucher expired'));
      if (voucher.used_count >= voucher.usage_limit) return callback(new Error('Voucher usage limit reached'));

      let discountAmount = 0;
      if (voucher.discount_type === 'percentage') {
        discountAmount = (numericSubtotal * Number(voucher.discount_value)) / 100;
      } else if (voucher.discount_type === 'fixed') {
        discountAmount = Number(voucher.discount_value);
      } else {
        return callback(new Error('Unsupported voucher type'));
      }

      // Discount cannot exceed subtotal
      discountAmount = Math.min(discountAmount, numericSubtotal);

      callback(null, {
        voucher_id: voucher.voucher_id,
        voucher_code: voucher.voucher_code,
        discount_type: voucher.discount_type,
        discount_value: Number(voucher.discount_value),
        discount_amount: discountAmount
      });
    });
  }
};

module.exports = VoucherModel;
