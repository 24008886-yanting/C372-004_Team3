const db = require('../db');

const RiskFlag = {
  create(userId, eventType, reason, details) {
    // Support two call styles:
    // 1) create(userId, eventType, reason, details)
    // 2) create(userId, eventType, detailsObj) (no reason text)
    let reasonText = null;
    let detailsObj = null;

    if (typeof reason === 'string') {
      reasonText = reason;
      detailsObj = details || null;
    } else {
      detailsObj = reason || null;
    }

    // Insert a new risk flag row with JSON-encoded details.
    const sql = `
      INSERT INTO risk_flags (user_id, event_type, reason, details, created_at)
      VALUES (?, ?, ?, ?, NOW())
    `;
    const payload = detailsObj ? JSON.stringify(detailsObj) : null;
    return new Promise((resolve, reject) => {
      db.query(sql, [userId, eventType, reasonText, payload], (err, result) => {
        if (err) return reject(err);
        resolve(result?.insertId || null);
      });
    });
  },

  async listAll(options = {}) {
    // Build a filtered query for admin listing.
    const limit = options.limit || 200;
    const clauses = [];
    const params = [];

    if (options.userId) {
      clauses.push('user_id = ?');
          }
    if (options.eventType) {
      clauses.push('event_type = ?');
    }

    let whereSql = '';
    if (clauses.length) {
      whereSql = 'WHERE ' + clauses.join(' AND ');
    }

    // Return latest flags first.
    const sql = `
      SELECT risk_flag_id, user_id, event_type, reason, details, created_at
      FROM risk_flags
      ${whereSql}
      ORDER BY created_at DESC, risk_flag_id DESC
      LIMIT ?
    `;

    if (options.userId) params.push(options.userId);
    if (options.eventType) params.push(options.eventType);
    params.push(limit);

    return new Promise((resolve, reject) => {
      db.query(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  },

  async countByUserIds(userIds = []) {
    // Return a map of user_id -> risk flag count.
    if (!Array.isArray(userIds) || userIds.length == 0) return {};
    const placeholders = userIds.map(() => '?').join(',');
    const sql = `
      SELECT user_id, COUNT(*) AS cnt
      FROM risk_flags
      WHERE user_id IN (${placeholders})
      GROUP BY user_id
    `;
    return new Promise((resolve, reject) => {
      db.query(sql, userIds, (err, rows) => {
        if (err) return reject(err);
        const map = {};
        (rows || []).forEach((row) => {
          map[row.user_id] = Number(row.cnt || 0);
        });
        resolve(map);
      });
    });
  },

  async listByUser(userId, options = {}) {
    // List recent flags for a single user.
    const limit = options.limit || 20;
    const sql = `
      SELECT risk_flag_id, user_id, event_type, reason, details, created_at
      FROM risk_flags
      WHERE user_id = ?
      ORDER BY created_at DESC, risk_flag_id DESC
      LIMIT ?
    `;
    return new Promise((resolve, reject) => {
      db.query(sql, [userId, limit], (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }
};

module.exports = RiskFlag;
