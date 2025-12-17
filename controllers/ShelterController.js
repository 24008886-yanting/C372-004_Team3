const Shelter = require('../models/Shelter');

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
    const { shelter_name, shelterName, contact_number, contactNumber } = req.body;
    const payload = {
      shelterName: shelter_name ?? shelterName,
      contactNumber: contact_number ?? contactNumber
    };

    Shelter.addShelter(payload, (err) => {
      if (err) {
        console.error('Failed to add shelter:', err);
        return res.status(500).render('addShelter', { error: 'Unable to add shelter' });
      }
      res.redirect('/shelterList');
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
