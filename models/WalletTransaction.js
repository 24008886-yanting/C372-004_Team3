const db = require('../db');

const WalletTransaction = {
  async listByUser(userId, options = {}) {
    const limit = options.limit || 50;
    const sql = `
      SELECT walletTxnId, walletId, user_id AS userId, txnType, amount, balanceBefore, balanceAfter,
             referenceType, referenceId, paymentMethod, description, createdAt
      FROM wallet_transactions
      WHERE user_id = ?
      ORDER BY createdAt DESC, walletTxnId DESC
      LIMIT ?
    `;
    return new Promise((resolve, reject) => {
      db.query(sql, [userId, limit], (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  },



  async countTopupsInWindow(userId, minutes) {
    const sql = `
      SELECT COUNT(*) AS cnt
      FROM wallet_transactions
      WHERE user_id = ?
        AND txnType = 'TOPUP'
        AND createdAt >= (NOW() - INTERVAL ? MINUTE)
    `;
    return new Promise((resolve, reject) => {
      db.query(sql, [userId, minutes], (err, rows) => {
        if (err) return reject(err);
        resolve(Number(rows?.[0]?.cnt || 0));
      });
    });
  },

  async sumTopupsInWindow(userId, minutes) {
    const sql = `
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM wallet_transactions
      WHERE user_id = ?
        AND txnType = 'TOPUP'
        AND createdAt >= (NOW() - INTERVAL ? MINUTE)
    `;
    return new Promise((resolve, reject) => {
      db.query(sql, [userId, minutes], (err, rows) => {
        if (err) return reject(err);
        resolve(Number(rows?.[0]?.total || 0));
      });
    });
  },
  async getDailyTopupTotal(userId) {
    const sql = `
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM wallet_transactions
      WHERE user_id = ? AND txnType = 'TOPUP' AND DATE(createdAt) = CURDATE()
    `;
    return new Promise((resolve, reject) => {
      db.query(sql, [userId], (err, rows) => {
        if (err) return reject(err);
        resolve(Number(rows?.[0]?.total || 0));
      });
    });
  }
};

module.exports = WalletTransaction;
