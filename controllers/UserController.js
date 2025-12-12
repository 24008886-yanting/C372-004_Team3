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

  // Authenticate a user by email only, set session and redirect
  login(req, res) {
    const { email, password } = req.body || {};
    if (!email || !password) {
      if (req.flash) req.flash('error', 'Email and password are required.');
      return res.redirect('/login');
    }

    User.findByEmail(email, async (err, user) => {
      if (err) {
        console.error('login error:', err);
        if (req.flash) req.flash('error', 'Login failed. Please try again.');
        return res.redirect('/login');
      }

      if (!user) {
        if (req.flash) req.flash('error', 'Invalid email or password. Please try again.');
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
          if (req.flash) req.flash('error', 'Invalid email or password. Please try again.');
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
        return res.redirect('/');
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
    res.render('register', { success, error, formData: {} });
  },

  // Register new user then log them in
  register(req, res) {
    const { username, email, phone, address, password } = req.body || {};
    const trimmed = {
      username: (username || '').trim(),
      email: (email || '').trim(),
      phone: (phone || '').trim(),
      address: (address || '').trim(),
      password: (password || '').trim()
    };
    const formData = {
      username: trimmed.username,
      email: trimmed.email,
      phone: trimmed.phone,
      address: trimmed.address
    };

    if (!trimmed.username || !trimmed.email || !trimmed.phone || !trimmed.password || !trimmed.address) {
      return res.status(400).render('register', {
        success: undefined,
        error: 'All fields (username, email, password, address, and contact number) are required.',
        formData
      });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(trimmed.email)) {
      return res.status(400).render('register', {
        success: undefined,
        error: 'Please enter a valid email address (format: name@example.com).',
        formData
      });
    }

    const phonePattern = /^\d{8}$/;
    if (!phonePattern.test(trimmed.phone)) {
      return res.status(400).render('register', {
        success: undefined,
        error: 'Contact number must be exactly 8 digits.',
        formData
      });
    }

    User.findByEmail(trimmed.email, (findErr, existingUser) => {
      if (findErr) {
        console.error('email lookup error:', findErr);
        return res.status(500).render('register', {
          success: undefined,
          error: 'Registration failed. Please try again.',
          formData
        });
      }

      if (existingUser) {
        return res.status(400).render('register', {
          success: undefined,
          error: 'Email is already registered. Please log in.',
          formData
        });
      }

      User.isAdopterEmail(trimmed.email, (adoptErr, isAdopterEmail) => {
        if (adoptErr) {
          console.error('adopter email lookup error:', adoptErr);
          return res.status(500).render('register', {
            success: undefined,
            error: 'Registration failed. Please try again.',
            formData
          });
        }

        const userData = {
          username: trimmed.username,
          email: trimmed.email,
          phone: trimmed.phone,
          address: trimmed.address,
          password: trimmed.password,
          role: isAdopterEmail ? 'adopter' : 'customer' // auto-upgrade if adopter email is on file
        };

        User.addUser(userData, (err, result) => {
          if (err) {
            console.error('register error:', err);
            return res.status(500).render('register', {
              success: undefined,
              error: 'Registration failed. Please try again.',
              formData
            });
          }

          const newUserId = result?.insertId;
          const sessionRole = userData.role;
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
      });
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
