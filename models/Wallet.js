const db = require('../db');
const Payment = require('./Payment');
const { toTwoDp } = Payment;

/**
 * Wallet model responsible for balance management and ledger insertion.
 * All credit/debit operations can run in their own DB transaction or
 * participate in an existing one when `manageTransaction` is false.
 */
const Wallet = {
  async getByUserId(userId, connection = db) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT walletId, user_id AS userId, balance, createdAt, updatedAt FROM wallets WHERE user_id = ? LIMIT 1';
      connection.query(sql, [userId], (err, rows) => {
        if (err) return reject(err);
        resolve(rows && rows.length > 0 ? rows[0] : null);
      });
    });
  },

  async createForUser(userId, connection = db) {
    return new Promise((resolve, reject) => {
      const sql = 'INSERT INTO wallets (user_id, balance, createdAt, updatedAt) VALUES (?, 0.00, NOW(), NOW())';
      connection.query(sql, [userId], (err, result) => {
        if (err) return reject(err);
        resolve({ walletId: result.insertId, balance: 0 });
      });
    });
  },

  async ensureWallet(userId, connection = db) {
    const existing = await this.getByUserId(userId, connection);
    if (existing) return existing;
    await this.createForUser(userId, connection);
    return this.getByUserId(userId, connection);
  },

  /**
   * Internal helper to run credit/debit logic with optional transaction management.
   */
  async updateBalance(userId, amountDelta, txnMeta, options = {}) {
    const connection = options.connection || db;
    const manageTransaction = options.manageTransaction !== false;

    const begin = () =>
      new Promise((resolve, reject) => {
        if (!manageTransaction) return resolve();
        connection.beginTransaction((err) => (err ? reject(err) : resolve()));
      });

    const commit = () =>
      new Promise((resolve, reject) => {
        if (!manageTransaction) return resolve();
        connection.commit((err) => (err ? reject(err) : resolve()));
      });

    const rollback = (error) =>
      new Promise((resolve, reject) => {
        if (!manageTransaction) return reject(error);
        connection.rollback(() => reject(error));
      });

    try {
      await begin();

      let wallet = await this.getByUserId(userId, connection);
      if (!wallet) {
        await this.createForUser(userId, connection);
        wallet = await this.getByUserId(userId, connection);
      }

      const before = toTwoDp(wallet.balance || 0);
      const after = toTwoDp(before + amountDelta);
      if (after < 0) {
        throw new Error('Insufficient wallet balance');
      }

      await new Promise((resolve, reject) => {
        const sql = 'UPDATE wallets SET balance = ?, updatedAt = NOW() WHERE walletId = ?';
        connection.query(sql, [after, wallet.walletId], (err) => (err ? reject(err) : resolve()));
      });

      await new Promise((resolve, reject) => {
        const sql = `
          INSERT INTO wallet_transactions
          (walletId, user_id, txnType, amount, balanceBefore, balanceAfter, referenceType, referenceId, paymentMethod, description, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;
        const params = [
          wallet.walletId,
          userId,
          txnMeta.txnType,
          toTwoDp(Math.abs(amountDelta)),
          toTwoDp(before),
          toTwoDp(after),
          txnMeta.referenceType || null,
          txnMeta.referenceId || null,
          txnMeta.paymentMethod || null,
          txnMeta.description || null
        ];
        connection.query(sql, params, (err) => (err ? reject(err) : resolve()));
      });

      await commit();
      return { walletId: wallet.walletId, balanceBefore: before, balanceAfter: after };
    } catch (err) {
      await rollback(err).catch(() => {});
      throw err;
    }
  },

  credit(userId, amount, meta, options = {}) {
    const safeAmount = toTwoDp(Number(amount) || 0);
    if (safeAmount <= 0) return Promise.reject(new Error('Credit amount must be greater than 0'));
    return this.updateBalance(userId, safeAmount, meta, options);
  },

  debit(userId, amount, meta, options = {}) {
    const safeAmount = toTwoDp(Number(amount) || 0);
    if (safeAmount <= 0) return Promise.reject(new Error('Debit amount must be greater than 0'));
    return this.updateBalance(userId, -safeAmount, meta, options);
  }
};

module.exports = Wallet;
