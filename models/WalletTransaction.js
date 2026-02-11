const db = require('../db');

const WalletTransaction = {
  async listByUser(userId, options = {}) { //This defines a function that lists wallet transaction history for a user.
    const limit = options.limit || 50; //This sets the maximum rows returned, defaulting to 50.
    const sql = `
      SELECT walletTxnId, walletId, user_id AS userId, txnType, amount, balanceBefore, balanceAfter,
             referenceType, referenceId, paymentMethod, description, createdAt
      FROM wallet_transactions
      WHERE user_id = ?
      ORDER BY createdAt DESC, walletTxnId DESC
      LIMIT ?
    `;//This selects wallet transaction fields needed for display.
    return new Promise((resolve, reject) => { //This wraps the query in a Promise for async use
      db.query(sql, [userId, limit], (err, rows) => {//This runs the query with userId and limit as placeholders
        if (err) return reject(err);
        resolve(rows || []);//This resolves with results, defaulting to an empty array if no rows.
      });
    });
  },



  async countTopupsInWindow(userId, minutes) {//This defines a function that counts how many TOPUP transactions happened within the last X minutes
    // Used by WalletController to flag rapid top-up bursts.
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
    // Used by WalletController to flag rapid top-up sum thresholds.
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
  async getDailyTopupTotal(userId) {//This defines a function that sums all TOPUP amounts for today only
    // Used by WalletController to enforce daily top-up cap and create risk flags.
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
