const Contact = require('../models/Contact');

const getSessionUser = (req) => {
  if (!req.session?.user) return null;
  const id = req.session.user.user_id ?? req.session.user_id;
  return { ...req.session.user, id };
};

const requireUser = (req, res) => {
  if (req.session?.user) return true;
  if (req.flash) req.flash('error', 'Please log in to continue.');
  res.redirect('/login');
  return false;
};

const requireAdmin = (req, res) => {
  if (!req.session?.user) {
    if (req.flash) req.flash('error', 'Please log in as an admin.');
    res.redirect('/login');
    return false;
  }

  const role = (req.session?.role || req.session?.user?.role || '').toLowerCase();
  if (role !== 'admin') {
    res.status(403).send('Unauthorized: admin role required.');
    return false;
  }

  return true;
};

const ContactController = {
  // User: render contact form
  showForm: (req, res) => {
    if (!requireUser(req, res)) return;
    const user = getSessionUser(req);
    const success = (req.flash && req.flash('contact_success')[0]) || undefined;
    const error = (req.flash && req.flash('contact_error')[0]) || undefined;
    res.render('contactForm', { user, success, error });
  },

  // User: submit contact form
  submitMessage: (req, res) => {
    if (!requireUser(req, res)) return;
    const user = getSessionUser(req);
    const { subject, message } = req.body || {};
    const trimmedSubject = (subject || '').trim();
    const trimmedMessage = (message || '').trim();

    if (!trimmedSubject || !trimmedMessage) {
      return res.status(400).render('contactForm', {
        user,
        error: 'Subject and message are required.',
        formData: { email: user?.email || '', subject, message }
      });
    }

    Contact.createMessage(
      {
        userId: user?.id,
        email: user?.email || '',
        subject: trimmedSubject,
        message: trimmedMessage
      },
      (err) => {
        if (err) {
          console.error('createMessage error:', err);
          return res.status(500).render('contactForm', {
            user,
            error: 'Failed to submit your message. Please try again.',
            formData: { email: user?.email || '', subject, message }
          });
        }
        if (req.flash) req.flash('contact_success', 'Message sent. We will reply soon.');
        return res.redirect('/contact');
      }
    );
  },

  // Admin: view all messages
  viewAllMessages: (req, res) => {
    if (!requireAdmin(req, res)) return;
    const success = (req.flash && req.flash('admin_contact_success')[0]) || undefined;
    const error = (req.flash && req.flash('admin_contact_error')[0]) || undefined;
    Contact.getAllMessages((err, rows) => {
      if (err) {
        console.error('getAllMessages error:', err);
        return res.status(500).render('allContactMessages', {
          messages: [],
          success,
          error: error || 'Failed to load messages.'
        });
      }
      res.render('allContactMessages', { messages: rows || [], success, error });
    });
  },

  // Admin: render reply form for a specific message
  showReplyForm: (req, res) => {
    if (!requireAdmin(req, res)) return;
    const messageId = req.params?.id;
    if (!messageId) {
      return res.status(400).render('adminReply', {
        message: null,
        error: 'Message ID is required.'
      });
    }

    Contact.getMessageById(messageId, (err, rows) => {
      if (err) {
        console.error('getMessageById error:', err);
        return res.status(500).render('adminReply', {
          message: null,
          error: 'Failed to load message.'
        });
      }

      const message = rows && rows[0];
      if (!message) {
        return res.status(404).render('adminReply', {
          message: null,
          error: 'Message not found.'
        });
      }

      if ((message.status || '').toLowerCase() === 'replied') {
        if (req.flash) req.flash('admin_contact_error', 'This message has already been replied to.');
        return res.redirect('/admin/messages');
      }

      res.render('adminReply', { message, error: undefined });
    });
  },

  // Admin: handle reply submission
  submitReply: (req, res) => {
    if (!requireAdmin(req, res)) return;
    const messageId = req.params?.id;
    const reply = (req.body?.reply || req.body?.admin_notes || '').trim();

    if (!messageId) {
      return res.status(400).render('adminReply', {
        message: null,
        error: 'Message ID is required.'
      });
    }

    if (!reply) {
      return Contact.getMessageById(messageId, (err, rows) => {
        if (err) {
          console.error('getMessageById error:', err);
          return res.status(500).render('adminReply', {
            message: null,
            error: 'Failed to load message.'
          });
        }
        const message = rows && rows[0];
        return res.status(400).render('adminReply', {
          message,
          error: 'Reply content is required.'
        });
      });
    }

    Contact.replyToMessage(messageId, reply, (err, result) => {
      if (err) {
        console.error('replyToMessage error:', err);
        if (req.flash) req.flash('admin_contact_error', 'Failed to send reply.');
        return res.redirect('/admin/messages');
      }

      if (result?.affectedRows === 0) {
        if (req.flash) req.flash('admin_contact_error', 'Message not found.');
        return res.redirect('/admin/messages');
      }

      if (req.flash) req.flash('admin_contact_success', 'Reply sent successfully.');
      return res.redirect('/admin/messages');
    });
  },

  // User: inbox for logged-in user
  viewInbox: (req, res) => {
    if (!requireUser(req, res)) return;
    const user = getSessionUser(req);
    const userId = user?.id;

    Contact.getMessagesByUserId(userId, (err, rows) => {
      if (err) {
        console.error('getMessagesByUserId error:', err);
        return res.status(500).render('userContactMessages', {
          messages: [],
          error: 'Failed to load your messages.'
        });
      }
      res.render('userContactMessages', { messages: rows || [], error: undefined });
    });
  }
};

module.exports = ContactController;
