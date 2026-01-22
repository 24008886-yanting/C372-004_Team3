const Shelter = require('../models/Shelter');
const User = require('../models/User');

// Controller methods returning EJS-rendered responses
const ShelterController = {
  // List all shelters
  listShelters(req, res) {
    Shelter.getAllShelters((err, shelters) => {
      if (err) {
        console.error('Failed to fetch shelters:', err);
        return res.status(500).render('shelterList', { shelters: [], error: 'Unable to load shelters' });
      }
      res.render('shelterList', { shelters, error: null });
    });
  },

  // Get a single shelter by ID
  getShelterById(req, res) {
    const { id } = req.params;
    Shelter.getShelterById(id, (err, results) => {
      if (err) {
        console.error('Failed to fetch shelter:', err);
        return res.status(500).render('shelter', { shelter: null, error: 'Unable to load shelter' });
      }
      const shelter = Array.isArray(results) ? results[0] : results;
      if (!shelter) {
        return res.status(404).render('shelter', { shelter: null, error: 'Shelter not found' });
      }
      res.render('shelter', { shelter, error: null });
    });
  },

  // Add a new shelter
  addShelter(req, res) {
    const { shelter_name, shelterName, contact_number, contactNumber, shelter_email, shelter_password } = req.body;
    const name = (shelter_name ?? shelterName ?? '').trim();
    const contact = (contact_number ?? contactNumber ?? '').trim();
    const email = (shelter_email || '').trim();
    const password = (shelter_password || '').trim();

    if (!name || !contact || !email || !password) {
      return res.status(400).render('addShelter', {
        error: 'Shelter name, contact number, login email, and password are required.'
      });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      return res.status(400).render('addShelter', {
        error: 'Please enter a valid login email for the shelter.'
      });
    }

    const payload = {
      shelterName: name,
      contactNumber: contact
    };

    Shelter.addShelter(payload, (err, result) => {
      if (err) {
        console.error('Failed to add shelter:', err);
        return res.status(500).render('addShelter', { error: 'Unable to add shelter' });
      }

      const userPayload = {
        username: name,
        email,
        phone: contact,
        address: '',
        role: 'shelter',
        password
      };

      User.addUser(userPayload, (userErr) => {
        if (userErr) {
          console.error('Failed to create shelter login:', userErr);
          // Optionally inform admin; leave shelter row intact for manual recovery
          return res.status(500).render('addShelter', { error: 'Shelter created but failed to create login. Please try again.' });
        }

        res.redirect('/shelterList');
      });
    });
  },

  // Update an existing shelter
  updateShelter(req, res) {
    const { id } = req.params;
    const updates = {
      shelter_name: req.body.shelter_name ?? req.body.shelterName,
      contact_number: req.body.contact_number ?? req.body.contactNumber
    };

    Shelter.updateShelter(id, updates, (err) => {
      if (err) {
        console.error('Failed to update shelter:', err);
        return res.status(500).render('shelter', { shelter: null, error: 'Unable to update shelter' });
      }
      res.redirect(`/shelter/${id}`);
    });
  },

  // Delete a shelter
  deleteShelter(req, res) {
    const { id } = req.params;
    Shelter.deleteShelter(id, (err) => {
      if (err) {
        console.error('Failed to delete shelter:', err);
        return res.status(500).render('shelterList', { shelters: [], error: 'Unable to delete shelter' });
      }
      res.redirect('/shelterList');
    });
  }
};

module.exports = ShelterController;
