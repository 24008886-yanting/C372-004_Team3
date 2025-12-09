const Contact = require('../models/Contact');

const ContactController = {
  /**
   * Render the contact form.
   */
  showForm: (req, res) => {
    const user = req.session?.user || null;
    const success = (req.flash && req.flash('success')[0]) || undefined;
    const error = (req.flash && req.flash('error')[0]) || undefined;
    res.render('contact', { user, success, error });
  },

  /**
   * Handle contact form submission (supports logged-in users and visitors).
   */
  submitMessage: (req, res) => {
    const userId = req.session?.user_id || null;
    const { email, subject, message } = req.body || {};

    if (!email || !subject || !message) {
      const formData = { email, subject, message };
      return res.render('contact', {
        user: req.session?.user || null,
        error: 'Please fill in all required fields.',
        formData
      });
    }

    Contact.createMessage(
      { userId, email, subject, message },
      (err) => {
        if (err) {
          console.error('createMessage error:', err);
          return res.render('contact', {
            user: req.session?.user || null,
            error: 'Failed to submit your message. Please try again.',
            formData: { email, subject, message }
          });
        }
        if (req.flash) req.flash('success', 'Message sent. We will reply soon.');
        return res.redirect('/contact');
      }
    );
  },

  /**
   * Admin: fetch all messages.
   */
  getAllMessages: (req, res) => {
    Contact.getAllMessages((err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to load messages' });
      }
      res.json(rows);
    });
  },

  /**
   * Admin: fetch a single message by ID.
   */
  getMessageById: (req, res) => {
    const messageId = req.params.id;
    Contact.getMessageById(messageId, (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to load message' });
      }
      const message = rows && rows[0];
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }
      res.json(message);
    });
  }
};

module.exports = ContactController;
