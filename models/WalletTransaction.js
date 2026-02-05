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
  }
};

module.exports = WalletTransaction;
