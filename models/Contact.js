const db = require('../db');

// Contact model helpers for contact_messages table.
const Contact = {
  /**
   * Create a new contact message (logged-in users only).
   */
  createMessage: ({ userId, email, subject, message }, callback) => {
    // Ensure we have a user owner for the message.
    if (!userId) {
      return callback(new Error('userId is required to create a contact message'));
    }
    // Insert message with Pending status by default.
    const sql = `
      INSERT INTO contact_messages (
        user_id,
        email,
        subject,
        message,
        status,
        admin_notes,
        created_at
      )
      VALUES (?, ?, ?, ?, 'Pending', NULL, NOW())
    `;
    const params = [userId, email, subject, message];
    db.query(sql, params, callback);
  },

  /**
   * Admin: fetch all contact messages (latest first), include username when available.
   */
  getAllMessages: (callback) => {
    // Join users to display usernames in the admin view.
    const sql = `
      SELECT
        cm.message_id,
        cm.user_id,
        u.username,
        u.role AS user_role,
        cm.email,
        cm.subject,
        cm.message,
        cm.status,
        cm.admin_notes,
        cm.created_at
      FROM contact_messages cm
      LEFT JOIN users u ON cm.user_id = u.user_id
      ORDER BY created_at DESC
    `;
    db.query(sql, callback);
  },

  /**
   * User: fetch messages for a specific user (latest first).
   */
  getMessagesByUserId: (userId, callback) => {
    // Pull only the current user's messages.
    const sql = `
      SELECT message_id, user_id, email, subject, message, status, admin_notes, created_at
      FROM contact_messages
      WHERE user_id = ?
      ORDER BY created_at DESC
    `;
    db.query(sql, [userId], callback);
  },

  /**
   * Fetch a single message by ID (admin use for reply validation).
   */
  getMessageById: (messageId, callback) => {
    // Retrieve a single message row for reply view.
    const sql = `
      SELECT message_id, user_id, email, subject, message, status, admin_notes, created_at
      FROM contact_messages
      WHERE message_id = ?
      LIMIT 1
    `;
    db.query(sql, [messageId], callback);
  },

  /**
   * Admin: update message with reply (admin notes + status).
   */
  replyToMessage: (messageId, adminNotes, callback) => {
    // Store reply content and mark the message as replied.
    const sql = `
      UPDATE contact_messages
      SET admin_notes = ?,
          status = 'Replied'
      WHERE message_id = ?
    `;
    db.query(sql, [adminNotes, messageId], callback);
  }
  
};

module.exports = Contact;
