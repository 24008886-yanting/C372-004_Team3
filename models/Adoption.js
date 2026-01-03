const db = require('../db');

// Function-based Adoption model using callbacks and MySQL queries
const Adoption = {
  // List all adoptions
  getAll(callback) {
    const sql = `
      SELECT adoption_id, shelter_id, cat_id, cat_name, adopter_email, adoption_date
      FROM adoptions
      ORDER BY adoption_date DESC, adoption_id DESC
    `;
    db.query(sql, callback);
  },

  // List adoptions for a specific shelter
  getByShelter(shelterId, callback) {
    const sql = `
      SELECT adoption_id, shelter_id, cat_id, cat_name, adopter_email, adoption_date
      FROM adoptions
      WHERE shelter_id = ?
      ORDER BY adoption_date DESC, adoption_id DESC
    `;
    db.query(sql, [shelterId], callback);
  },

  // Insert a new adoption record
  addAdoption({ shelterId, catId, catName, adopterEmail, adoptionDate }, callback) {
    const hasDate = Boolean(adoptionDate);
    const sql = hasDate
      ? `INSERT INTO adoptions (shelter_id, cat_id, cat_name, adopter_email, adoption_date)
         VALUES (?, ?, ?, ?, ?)`
      : `INSERT INTO adoptions (shelter_id, cat_id, cat_name, adopter_email, adoption_date)
         VALUES (?, ?, ?, ?, CURDATE())`;
    const params = hasDate
      ? [shelterId, catId, catName, adopterEmail, adoptionDate]
      : [shelterId, catId, catName, adopterEmail];
    db.query(sql, params, callback);
  }
};

module.exports = Adoption;
