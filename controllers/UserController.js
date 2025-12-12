const bcrypt = require('bcrypt');
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
  },

  // Render the account details page for the current user (session) or provided userId
  renderAccountDetails(req, res) {
    const userId = req.session?.user_id || req.query.userId || req.query.id;
    const success = (req.flash && req.flash('account_success')[0]) || undefined;
    const errorFromFlash = (req.flash && req.flash('account_error')[0]) || undefined;

    if (!userId) {
      return res.status(200).render('accountDetails', {
        user: null,
        success,
        error: errorFromFlash || 'Please sign in to view your account.'
      });
    }

    User.getUserById(userId, (err, results) => {
      if (err) {
        console.error('getUserById error:', err);
        return res.status(500).render('accountDetails', {
          user: null,
          success: undefined,
          error: 'Failed to load account details. Please try again.'
        });
      }

      if (!results || results.length === 0) {
        return res.status(404).render('accountDetails', {
          user: null,
          success: undefined,
          error: 'User not found.'
        });
      }

      const user = results[0];
      res.render('accountDetails', { user, success, error: errorFromFlash });
    });
  },

  // Handle updates from the account details form; hashes password via the model
  updateAccountDetails(req, res) {
    const userId = req.session?.user_id || req.body.user_id || req.query.userId || req.query.id;
    const { username, email, phone, password } = req.body || {};

    if (!userId) {
      if (req.flash) req.flash('account_error', 'Please sign in to update your account.');
      return res.redirect('/accountDetails');
    }

    if (!username || !email || !phone) {
      return res.status(400).render('accountDetails', {
        user: { user_id: userId, username, email, phone },
        success: undefined,
        error: 'Username, email, and contact number are required.'
      });
    }

    const updates = {
      username: username.trim(),
      email: email.trim(),
      phone: phone.trim()
    };

    const trimmedPassword = password && password.trim();
    if (trimmedPassword) {
      updates.password = trimmedPassword; // hashed inside the model
    }

    User.updateUser(userId, updates, (err, result) => {
      if (err) {
        console.error('updateUser error:', err);
        return res.status(500).render('accountDetails', {
          user: { user_id: userId, username, email, phone },
          success: undefined,
          error: 'Failed to update account. Please try again.'
        });
      }

      if (result?.affectedRows === 0) {
        return res.status(404).render('accountDetails', {
          user: null,
          success: undefined,
          error: 'User not found.'
        });
      }

      if (req.flash) req.flash('account_success', 'Account details updated successfully.');
      const redirectUrl = `/accountDetails${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`;
      return res.redirect(redirectUrl);
    });
  },

  // Authenticate a user by email or username, set session and redirect
  login(req, res) {
    const { identifier, password } = req.body || {};
    if (!identifier || !password) {
      if (req.flash) req.flash('error', 'Username and password are required.');
      return res.redirect('/login');
    }

    User.findByEmailOrUsername(identifier, async (err, user) => {
      if (err) {
        console.error('login error:', err);
        if (req.flash) req.flash('error', 'Login failed. Please try again.');
        return res.redirect('/login');
      }

      if (!user) {
        if (req.flash) req.flash('error', 'Invalid credentials.');
        return res.redirect('/login');
      }

      try {
        // Support both hashed passwords and seed data stored in plaintext
        let match = false;
        const stored = user.password || '';
        const isBcrypt = stored.startsWith('$2');

        if (isBcrypt) {
          match = await bcrypt.compare(password, stored);
        } else {
          match = stored === password;
        }

        if (!match) {
          if (req.flash) req.flash('error', 'Invalid credentials.');
          return res.redirect('/login');
        }

        req.session.user_id = user.user_id;
        req.session.role = user.role || 'customer';
        req.session.user = {
          user_id: user.user_id,
          username: user.username,
          email: user.email,
          role: user.role || 'customer'
        };

        if (req.flash) req.flash('success', `Welcome back, ${user.username || 'user'}!`);
        const destination = (user.role || '').toLowerCase() === 'admin' ? '/admin' : '/';
        return res.redirect(destination);
      } catch (compareErr) {
        console.error('password compare error:', compareErr);
        if (req.flash) req.flash('error', 'Login failed. Please try again.');
        return res.redirect('/login');
      }
    });
  },

  // Render register page
  renderRegister(req, res) {
    const success = (req.flash && req.flash('success')[0]) || undefined;
    const error = (req.flash && req.flash('error')[0]) || undefined;
    res.render('register', { success, error, form: {} });
  },

  // Register new user then log them in
  register(req, res) {
    const { username, email, phone, address, password, role } = req.body || {};
    const allowedRoles = ['customer', 'adopter', 'shelter']; // admin stays internal-only

    if (!username || !email || !phone || !password) {
      if (req.flash) req.flash('error', 'All fields are required.');
      return res.redirect('/register');
    }

    const userData = {
      username: username.trim(),
      email: email.trim(),
      phone: phone.trim(),
      address: (address || '').trim(),
      password: password.trim(),
      role: allowedRoles.includes(role) ? role : 'customer'
    };

    User.addUser(userData, (err, result) => {
      if (err) {
        console.error('register error:', err);
        if (req.flash) req.flash('error', 'Registration failed. Please try again.');
        return res.redirect('/register');
      }

      const newUserId = result?.insertId;
      // Auto-login after registration; preserve adopter vs customer role
      const sessionRole = userData.role || 'customer';
      req.session.user_id = newUserId;
      req.session.role = sessionRole;
      req.session.user = {
        user_id: newUserId,
        username: userData.username,
        email: userData.email,
        role: sessionRole
      };

      if (req.flash) req.flash('success', 'Account created successfully.');
      res.redirect('/');
    });
  },

  // Logout and destroy session
  logout(req, res) {
    req.session.destroy(() => {
      res.redirect('/login');
    });
  }
};

// Role definitions for reference:
// adopter  = adopted a cat before; can enjoy discounts and checkout with vouchers
// customer = regular user; no discounts
// admin    = manages everything (e.g., add/edit/view products by ID)
// shelter  = animal shelter account; can submit adopter information

module.exports = UserController;
