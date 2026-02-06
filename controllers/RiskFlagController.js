const RiskFlag = require('../models/RiskFlag');

const parseDetails = (raw) => {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return { raw };
  }
};

const RiskFlagController = {
  async listAll(req, res) {
    try {
      const userIdRaw = String(req.query?.user_id || '').trim();
      const eventTypeRaw = String(req.query?.event_type || '').trim();
      const userId = userIdRaw && /^\d+$/.test(userIdRaw) ? Number(userIdRaw) : null;
      const eventType = eventTypeRaw ? eventTypeRaw.toUpperCase() : null;

      const rows = await RiskFlag.listAll({ limit: 200, userId, eventType });
      const flags = (rows || []).map((flag) => ({
        ...flag,
        details: parseDetails(flag.details)
      }));
      return res.render('adminRiskFlags', {
        flags,
        filters: { userId: userIdRaw, eventType: eventTypeRaw }
      });
    } catch (err) {
      console.error('risk flags list error:', err);
      return res.status(500).render('adminRiskFlags', { flags: [], error: 'Failed to load risk flags.' });
    }
  }
};

module.exports = RiskFlagController;
