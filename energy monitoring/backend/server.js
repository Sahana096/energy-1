const express    = require('express');
const cors       = require('cors');
const dotenv     = require('dotenv');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const connectDB  = require('./config/db');
const seedAdmin  = require('./config/seedAdmin');
const errorHandler = require('./middleware/errorHandler');

dotenv.config();

// Connect to MongoDB, then seed the admin account
connectDB().then(() => seedAdmin()).catch(() => {});

const app = express();

// ── Security headers ──────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

// ── Rate limiting ─────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // max 20 login attempts per 15 min per IP
  message: { success: false, message: 'Too many attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

// ── Core middleware ───────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// Simple request logger (dev only)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// ── Routes ────────────────────────────────────────────────────────────
app.use('/api/auth',            authLimiter, require('./routes/auth'));
app.use('/api/devices',         require('./routes/devices'));
app.use('/api/energy',          require('./routes/energy'));
app.use('/api/analytics',       require('./routes/analytics'));
app.use('/api/ml',              require('./routes/ml'));
app.use('/api/recommendations', require('./routes/recommendations'));
app.use('/api/carbon',          require('./routes/carbon'));
app.use('/api/uploads',         require('./routes/uploads'));

// ── 404 ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found.' });
});

// ── Centralised error handler (must be last) ──────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\nEnergyAI Backend running on http://localhost:${PORT}`);
});

module.exports = app;
