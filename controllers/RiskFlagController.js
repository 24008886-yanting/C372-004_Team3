const RiskFlag = require('../models/RiskFlag');

// Safely parse JSON details stored as string in DB.
const parseDetails = (raw) => {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch (err) {
    // Fall back to showing the raw value if parsing fails.
    return { raw };
  }
};

const RiskFlagController = {
  async listAll(req, res) {
    try {
      // Read optional filters from query string.
      const userIdRaw = String(req.query?.user_id || '').trim();
      const eventTypeRaw = String(req.query?.event_type || '').trim();
      // Normalize filters for the model.
      const userId = userIdRaw && /^\d+$/.test(userIdRaw) ? Number(userIdRaw) : null;
      const eventType = eventTypeRaw ? eventTypeRaw.toUpperCase() : null;

      // Fetch recent risk flags with filters applied.
      const rows = await RiskFlag.listAll({ limit: 200, userId, eventType });
      // Parse details JSON for display.
      const flags = (rows || []).map((flag) => ({
        ...flag,
        details: parseDetails(flag.details)
      }));
      // Render admin list with filter values preserved.
      return res.render('adminRiskFlags', {
        flags,
        filters: { userId: userIdRaw, eventType: eventTypeRaw }
      });
    } catch (err) {
      // Fail closed with a generic error message.
      console.error('risk flags list error:', err);
      return res.status(500).render('adminRiskFlags', { flags: [], error: 'Failed to load risk flags.' });
    }
  }
};

module.exports = RiskFlagController;
