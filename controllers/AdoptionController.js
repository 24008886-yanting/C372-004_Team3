const Adoption = require('../models/Adoption');
const User = require('../models/User');
const Wallet = require('../models/Wallet');

const toInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const trim = (value) => (typeof value === 'string' ? value.trim() : '');
const normalizeRole = (value) => (value ? String(value).toLowerCase() : '');

const ensureAdopterAccount = (email, done) => {
  if (!email) return done(null, { created: false, userId: null });

  User.findByEmail(email, (findErr, existing) => {
    if (findErr) return done(findErr);
    if (existing) {
      const currentRole = normalizeRole(existing.role);
      if (currentRole === 'customer' || !currentRole) {
        return User.updateUser(existing.user_id, { role: 'adopter' }, (updateErr) => {
          if (updateErr) return done(updateErr);
          return done(null, { created: false, userId: existing.user_id });
        });
      }
      return done(null, { created: false, userId: existing.user_id });
    }

    const userData = {
      username: email,
      email,
      phone: '',
      address: '',
      password: email,
      role: 'adopter'
    };

    User.addUser(userData, (addErr, result) => {
      if (addErr) return done(addErr);
      const userId = result?.insertId || null;
      if (userId) {
        Wallet.ensureWallet(userId).catch((walletErr) => {
          console.error('Failed to create wallet for adopter:', walletErr);
        });
      }
      return done(null, { created: true, userId });
    });
  });
};

const AdoptionController = {
  // Render the add adopter form
  showAddForm(req, res) {
    const shelterId = req.session?.user?.shelter_id || req.session?.shelter_id || '';
    const success = req.query?.success === '1';
    const adoptionId = req.query?.adoptionId || '';
    const accountParam = req.query?.account;
    const accountCreated = accountParam === '1' ? true : accountParam === '0' ? false : null;
    res.render('addAdopter', {
      error: null,
      success,
      adoptionId,
      accountCreated,
      formData: {
        shelter_id: shelterId,
        cat_id: '',
        cat_name: '',
        adopter_email: '',
        adoption_date: ''
      }
    });
  },

  // Create a new adoption record (shelter only)
  addAdoption(req, res) {
    // Beginner note: validate form data, save the adoption, then create/upgrade the adopter account.
    const sessionShelterId = req.session?.user?.shelter_id || req.session?.shelter_id || '';
    const shelterInput = trim(req.body?.shelter_id);
    const catIdInput = trim(req.body?.cat_id);
    const catName = trim(req.body?.cat_name);
    const adopterEmail = trim(req.body?.adopter_email);
    const adoptionDate = trim(req.body?.adoption_date);

    const shelterId = toInt(sessionShelterId || shelterInput);
    const catId = toInt(catIdInput);

    const formData = {
      shelter_id: shelterInput || sessionShelterId,
      cat_id: catIdInput,
      cat_name: catName,
      adopter_email: adopterEmail,
      adoption_date: adoptionDate
    };

    if (!shelterId) {
      return res.status(400).render('addAdopter', {
        error: 'Shelter ID is required.',
        success: false,
        adoptionId: '',
        formData
      });
    }

    if (!catId) {
      return res.status(400).render('addAdopter', {
        error: 'Cat ID is required.',
        success: false,
        adoptionId: '',
        formData
      });
    }

    if (!catName) {
      return res.status(400).render('addAdopter', {
        error: 'Cat name is required.',
        success: false,
        adoptionId: '',
        formData
      });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!adopterEmail || !emailPattern.test(adopterEmail)) {
      return res.status(400).render('addAdopter', {
        error: 'Please provide a valid adopter email.',
        success: false,
        adoptionId: '',
        formData
      });
    }

    // Save adoption into the database.
    Adoption.addAdoption({
      shelterId,
      catId,
      catName,
      adopterEmail,
      adoptionDate: adoptionDate || null
    }, (err, result) => {
      if (err) {
        console.error('Failed to add adoption:', err);
        return res.status(500).render('addAdopter', {
          error: 'Unable to save adopter information.',
          success: false,
          adoptionId: '',
          formData
        });
      }

      // Ensure the adopter has an account (create or promote to adopter).
      ensureAdopterAccount(adopterEmail, (accountErr, accountResult) => {
        if (accountErr) {
          console.error('Failed to create adopter account:', accountErr);
          return res.status(500).render('addAdopter', {
            error: 'Adopter saved, but account creation failed. Please try again.',
            success: false,
            adoptionId: result?.insertId || '',
            formData
          });
        }

        // Redirect back to the form with success flags to show a banner.
        const savedId = result?.insertId;
        const accountCreated = accountResult?.created ? 1 : 0;
        const query = savedId
          ? `?success=1&adoptionId=${encodeURIComponent(savedId)}&account=${accountCreated}`
          : `?success=1&account=${accountCreated}`;
        return res.redirect(`/addAdopter${query}`);
      });
    });
  },

  // List adoption records (shelter only)
  listAdoptions(req, res) {
    // Beginner note: show all adoptions or filter by shelter_id if provided.
    const sessionShelterId = req.session?.user?.shelter_id || req.session?.shelter_id || '';
    const filterInput = trim(req.query?.shelter_id);
    const shelterId = toInt(sessionShelterId || filterInput);

    const handleResults = (err, adoptions) => {
      if (err) {
        console.error('Failed to fetch adoptions:', err);
        return res.status(500).render('adoptedList', {
          adoptions: [],
          error: 'Unable to load adoption records.',
          shelterId: shelterId || filterInput || null
        });
      }
      return res.render('adoptedList', {
        adoptions: adoptions || [],
        error: null,
        shelterId: shelterId || filterInput || null
      });
    };

    if (shelterId) {
      return Adoption.getByShelter(shelterId, handleResults);
    }

    return Adoption.getAll(handleResults);
  }
};

module.exports = AdoptionController;
