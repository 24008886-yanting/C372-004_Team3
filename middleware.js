// Auth guard: checks authentication
const checkAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) return next();

  // Detect AJAX/JSON requests so we can return a 401 payload instead of redirecting
  const wantsJson =
    req.xhr ||
    req.headers['x-requested-with'] === 'XMLHttpRequest' ||
    (req.headers.accept || '').includes('application/json') ||
    (req.headers['content-type'] || '').includes('application/json');

  if (wantsJson) {
    return res.status(401).json({
      error: 'Authentication required',
      requiresLogin: true,
      loginUrl: '/login'
    });
  }

  req.flash('error', 'Please log in to view this resource');
  return res.redirect('/login');
};

// Auth guard: checks authorisation
const checkAuthorised = (roles = []) => {
  return (req, res, next) => {
    // Only check authorisation, assume authentication is already checked
    const userRole = req.session.role || (req.session.user && req.session.user.role);
    if (roles.length === 0 || roles.includes(userRole)) {
      return next();
    }
    req.flash('error', 'You do not have permission to view this resource');
    return res.redirect('/');
  };
};

module.exports = { checkAuthenticated, checkAuthorised };
