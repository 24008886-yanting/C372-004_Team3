const db = require('../db');

// Contact model with basic CRUD helpers for contact_messages table.
const Contact = {
  /**
   * Create a new contact message. userId is optional (visitors allowed).
   */
  createMessage: ({ userId = null, email, subject, message }, callback) => {
    // Let DB defaults handle status/admin_notes to avoid type mismatches.
    const sql = `
      INSERT INTO contact_messages (user_id, email, subject, message, created_at)
      VALUES (?, ?, ?, ?, NOW())
    `;
    const params = [userId, email, subject, message];
    db.query(sql, params, callback);
  },

  /**
   * Fetch all contact messages (latest first).
   */
  getAllMessages: (callback) => {
    const sql = `
      SELECT message_id, user_id, email, subject, message, status, admin_notes, created_at
      FROM contact_messages
      ORDER BY created_at DESC
    `;
    db.query(sql, callback);
  },

  /**
   * Fetch a single message by ID.
   */
  getMessageById: (messageId, callback) => {
    const sql = `
      SELECT message_id, user_id, email, subject, message, status, admin_notes, created_at
      FROM contact_messages
      WHERE message_id = ?
      LIMIT 1
    `;
    db.query(sql, [messageId], callback);
  },

  /**
   * Admin: update message status.
   */
  updateStatus: (messageId, status, callback) => {
    const sql = `
      UPDATE contact_messages
      SET status = ?
      WHERE message_id = ?
    `;
    db.query(sql, [status, messageId], callback);
  },

  /**
   * Admin: update admin notes.
   */
  updateAdminNotes: (messageId, adminNotes, callback) => {
    const sql = `
      UPDATE contact_messages
      SET admin_notes = ?
      WHERE message_id = ?
    `;
    db.query(sql, [adminNotes, messageId], callback);
  }
  
};

module.exports = Contact;
