const db = require('../db');
const bcrypt = require('bcrypt');

// Function-based user model using callbacks and MySQL connection
const User = {
  // Fetch all users
  getAllUsers(callback) {
    const sql = 'SELECT user_id, username, email, phone, address, role, created_at FROM users';
    db.query(sql, callback);
  },

  // Fetch a single user by primary key
  getUserById(userId, callback) {
    const sql = 'SELECT user_id, username, email, phone, address, role, created_at FROM users WHERE user_id = ?';
    db.query(sql, [userId], callback);
  },

  // Find a single user by email (for login)
  findByEmail(email, callback) {
    const sql = 'SELECT * FROM users WHERE email = ? LIMIT 1';
    db.query(sql, [email], (err, results) => {
      if (err) return callback(err);
      if (!results || results.length === 0) {
        return callback(null, null);
      }
      callback(null, results[0]);
    });
  },

  
  // Create a new user with hashed password
  addUser(userData, callback) {
    const { username, password, email, phone, address, role } = userData;
    if (!password) {
      return callback(new Error('Password is required'));
    }

    bcrypt.hash(password, 10, (hashErr, hash) => {
      if (hashErr) return callback(hashErr);

      const sql = `INSERT INTO users (username, password, email, phone, address, role)
                   VALUES (?, ?, ?, ?, ?, ?)`;
      const params = [username, hash, email, phone, address, role];
      db.query(sql, params, callback);
    });
  },

  // Update user fields; if password is provided, hash it before updating
  updateUser(userId, updates, callback) {
    const fields = [];
    const params = [];

    if (updates.username !== undefined) {
      fields.push('username = ?');
      params.push(updates.username);
    }
    if (updates.email !== undefined) {
      fields.push('email = ?');
      params.push(updates.email);
    }
    if (updates.phone !== undefined) {
      fields.push('phone = ?');
      params.push(updates.phone);
    }
    if (updates.address !== undefined) {
      fields.push('address = ?');
      params.push(updates.address);
    }
    if (updates.role !== undefined) {
      fields.push('role = ?');
      params.push(updates.role);
    }

    const applyUpdate = () => {
      if (!fields.length) {
        return callback(new Error('No fields to update'));
      }
      const sql = `UPDATE users SET ${fields.join(', ')} WHERE user_id = ?`;
      params.push(userId);
      db.query(sql, params, callback);
    };

    if (updates.password !== undefined) {
      bcrypt.hash(updates.password, 10, (hashErr, hash) => {
        if (hashErr) return callback(hashErr);
        fields.push('password = ?');
        params.push(hash);
        applyUpdate();
      });
    } else {
      applyUpdate();
    }
  },

  // Delete user by primary key
  deleteUser(userId, callback) {
    const sql = 'DELETE FROM users WHERE user_id = ?';
    db.query(sql, [userId], callback);
  }
};

module.exports = User;
