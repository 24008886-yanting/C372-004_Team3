const db = require('../db');

// Function-based Shelter model (callbacks + MySQL queries)
const Shelter = {
  /**
   * Get all shelters; keeps shelter_id in the select so dependent tables
   * (e.g., adoptions linked via shelter_id) can be joined upstream if needed.
   */
  getAllShelters(callback) {
    const sql = `
      SELECT s.shelter_id, s.shelter_name, s.contact_number
      FROM shelters s
      ORDER BY s.shelter_name ASC
    `;
    db.query(sql, callback);
  },

  /**
   * Get a single shelter by primary key.
   */
  getShelterById(shelterId, callback) {
    const sql = `
      SELECT s.shelter_id, s.shelter_name, s.contact_number
      FROM shelters s
      WHERE s.shelter_id = ?
      LIMIT 1
    `;
    db.query(sql, [shelterId], callback);
  },

  /**
   * Insert a new shelter.
   */
  addShelter({ shelterName, contactNumber }, callback) {
    const sql = `
      INSERT INTO shelters (shelter_name, contact_number)
      VALUES (?, ?)
    `;
    db.query(sql, [shelterName, contactNumber], callback);
  },

  /**
   * Update shelter_name/contact_number by shelter_id.
   */
  updateShelter(shelterId, updates, callback) {
    const fields = [];
    const params = [];

    if (updates.shelter_name !== undefined || updates.shelterName !== undefined) {
      fields.push('shelter_name = ?');
      params.push(updates.shelter_name ?? updates.shelterName);
    }
    if (updates.contact_number !== undefined || updates.contactNumber !== undefined) {
      fields.push('contact_number = ?');
      params.push(updates.contact_number ?? updates.contactNumber);
    }

    if (!fields.length) {
      return callback(new Error('No fields to update'));
    }

    const sql = `UPDATE shelters SET ${fields.join(', ')} WHERE shelter_id = ?`;
    params.push(shelterId);
    db.query(sql, params, callback);
  },

  /**
   * Delete a shelter; will respect FK constraints on shelter_id in linked tables.
   */
  deleteShelter(shelterId, callback) {
    const sql = 'DELETE FROM shelters WHERE shelter_id = ?';
    db.query(sql, [shelterId], callback);
  }
};

module.exports = Shelter;
