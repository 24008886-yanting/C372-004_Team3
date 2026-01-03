const Adoption = require('../models/Adoption');

const toInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const trim = (value) => (typeof value === 'string' ? value.trim() : '');

const AdoptionController = {
  // Render the add adopter form
  showAddForm(req, res) {
    const shelterId = req.session?.user?.shelter_id || req.session?.shelter_id || '';
    const success = req.query?.success === '1';
    const adoptionId = req.query?.adoptionId || '';
    res.render('addAdopter', {
      error: null,
      success,
      adoptionId,
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

      const savedId = result?.insertId;
      const query = savedId ? `?success=1&adoptionId=${encodeURIComponent(savedId)}` : '?success=1';
      return res.redirect(`/addAdopter${query}`);
    });
  },

  // List adoption records (shelter only)
  listAdoptions(req, res) {
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
