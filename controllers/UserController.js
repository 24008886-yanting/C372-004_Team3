const User = require('../models/User');

// Simple helper: try to render an EJS view; if not available, fall back to JSON.
const renderOrJson = (res, view, payload) => {
  res.render(view, payload, (err, html) => {
    if (err) {
      return res.json(payload);
    }
    res.send(html);
  });
};

const UserController = {
  // List all users
  listUsers(req, res) {
    User.getAllUsers((err, results) => {
      if (err) return res.status(500).json({ error: 'Failed to fetch users', details: err });
      renderOrJson(res, 'users/list', { users: results });
    });
  },

  // Get one user by ID
  getUserById(req, res) {
    const { id } = req.params;
    User.getUserById(id, (err, results) => {
      if (err) return res.status(500).json({ error: 'Failed to fetch user', details: err });
      if (!results || results.length === 0) return res.status(404).json({ error: 'User not found' });
      renderOrJson(res, 'users/detail', { user: results[0] });
    });
  },

  // Add a new user
  addUser(req, res) {
    User.addUser(req.body, (err, result) => {
      if (err) return res.status(500).json({ error: 'Failed to add user', details: err });
      const user_id = result?.insertId;
      renderOrJson(res, 'users/create-success', { message: 'User created', user_id });
    });
  },

  // Update a user by ID
  updateUser(req, res) {
    const { id } = req.params;
    User.updateUser(id, req.body, (err, result) => {
      if (err) return res.status(500).json({ error: 'Failed to update user', details: err });
      if (result?.affectedRows === 0) return res.status(404).json({ error: 'User not found' });
      renderOrJson(res, 'users/update-success', { message: 'User updated', user_id: id });
    });
  },

  // Delete a user by ID
  deleteUser(req, res) {
    const { id } = req.params;
    User.deleteUser(id, (err, result) => {
      if (err) return res.status(500).json({ error: 'Failed to delete user', details: err });
      if (result?.affectedRows === 0) return res.status(404).json({ error: 'User not found' });
      renderOrJson(res, 'users/delete-success', { message: 'User deleted', user_id: id });
    });
  }
};

// Role definitions for reference:
// adopter  = adopted a cat before; can enjoy discounts and checkout with vouchers
// customer = regular user; no discounts
// admin    = manages everything (e.g., add/edit/view products by ID)
// shelter  = animal shelter account; can submit adopter information

module.exports = UserController;
