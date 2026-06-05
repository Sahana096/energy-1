/**
 * Ensures an admin user exists in the database.
 * Called once on server startup — safe to run repeatedly.
 *
 * Credentials (override via env):
 *   ADMIN_EMAIL    default: admin@energyai.com
 *   ADMIN_PASSWORD default: admin123
 */
const bcrypt = require('bcryptjs');
const User   = require('../models/User');

const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@energyai.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_NAME     = process.env.ADMIN_NAME     || 'Admin';

async function seedAdmin() {
  try {
    const existing = await User.findOne({ email: ADMIN_EMAIL });
    if (existing) {
      // Ensure role is admin in case it was changed
      if (existing.role !== 'admin') {
        existing.role = 'admin';
        await existing.save();
        console.log(`[seed] Admin role restored for ${ADMIN_EMAIL}`);
      }
      return;
    }

    const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await User.create({ name: ADMIN_NAME, email: ADMIN_EMAIL, password: hashed, role: 'admin' });
    console.log(`[seed] Admin user created — ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  } catch (err) {
    console.error('[seed] Failed to seed admin:', err.message);
  }
}

module.exports = seedAdmin;
