const db = require('../db');
const Payment = require('./Payment');
const RiskFlag = require('./RiskFlag'); // record wallet-related risk events
const { toTwoDp } = Payment;

const WALLET_BALANCE_CAP = Number(process.env.WALLET_BALANCE_CAP || 1000);

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
  //This defines an async function that creates a new wallet with 0 balance for a user
  async createForUser(userId, connection = db) {
    return new Promise((resolve, reject) => { //This wraps the insert query in a Promise
      const sql = 'INSERT INTO wallets (user_id, balance, createdAt, updatedAt) VALUES (?, 0.00, NOW(), NOW())';
      connection.query(sql, [userId], (err, result) => {
        if (err) return reject(err); //This rejects if insert fails.
        resolve({ walletId: result.insertId, balance: 0 }); //This returns the new walletId and starting balance
      });
    });
  },

  async ensureWallet(userId, connection = db) { //This defines a function that guarantees the user has a wallet before continuing
    const existing = await this.getByUserId(userId, connection); //This checks if a wallet already exists for the user
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
      if (amountDelta > 0 && after > WALLET_BALANCE_CAP) {
        try {
          // Flag balance-cap violations during wallet updates.
          await RiskFlag.create(userId, 'WALLET_BALANCE_CAP_EXCEEDED', 'Wallet balance cap exceeded', {
            cap: WALLET_BALANCE_CAP,
            balanceBefore: before,
            attemptedDelta: amountDelta
          });
        } catch (flagErr) {
          // ignore risk flag logging errors
        }
        throw new Error(`Wallet balance cap of S$${WALLET_BALANCE_CAP} exceeded`);
      }
      if (after < 0) { //This checks if the wallet would become negative.
        throw new Error('Insufficient wallet balance'); //This blocks the debit because user does not have enough balance.
      }

      await new Promise((resolve, reject) => { //This wraps the balance update SQL into a Promise for async/await.
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
          txnMeta.paymentMethod || null, //This stores payment method info (e.g., NETS, PayPal), or null.
          txnMeta.description || null
        ];
        connection.query(sql, params, (err) => (err ? reject(err) : resolve())); //This inserts the wallet transaction log row.
      });

      await commit(); //This commits the DB transaction if it is being managed here.
      return { walletId: wallet.walletId, balanceBefore: before, balanceAfter: after };
    } catch (err) {
      await rollback(err).catch(() => {});
      throw err;
    }
  },

  credit(userId, amount, meta, options = {}) { //This defines a function that increases wallet balance and logs the transaction.
    const safeAmount = toTwoDp(Number(amount) || 0);
    if (safeAmount <= 0) return Promise.reject(new Error('Credit amount must be greater than 0'));
    return this.updateBalance(userId, safeAmount, meta, options);
  },

  debit(userId, amount, meta, options = {}) { //This defines a function that decreases wallet balance and logs the transaction.
    const safeAmount = toTwoDp(Number(amount) || 0);
    if (safeAmount <= 0) return Promise.reject(new Error('Debit amount must be greater than 0'));
    return this.updateBalance(userId, -safeAmount, meta, options);
  }
};

Wallet.BALANCE_CAP = WALLET_BALANCE_CAP;

module.exports = Wallet;
