/**
 * Input validation middleware
 * Each validator calls next() on success or returns 400 with { success: false, message }
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function bad(res, message) {
  return res.status(400).json({ success: false, message });
}

// ── Auth ──────────────────────────────────────────────────────────────
const validateLogin = (req, res, next) => {
  const { email, password } = req.body;
  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return bad(res, 'A valid email address is required.');
  }
  if (!password || typeof password !== 'string' || password.length < 1) {
    return bad(res, 'Password is required.');
  }
  req.body.email = email.trim().toLowerCase();
  next();
};

const validateRegister = (req, res, next) => {
  const { name, email, password } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return bad(res, 'Name must be at least 2 characters.');
  }
  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return bad(res, 'A valid email address is required.');
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return bad(res, 'Password must be at least 8 characters.');
  }
  req.body.name  = name.trim();
  req.body.email = email.trim().toLowerCase();
  next();
};

const validateOTPRequest = (req, res, next) => {
  const { email } = req.body;
  if (!email || !EMAIL_RE.test(email.trim())) {
    return bad(res, 'A valid email address is required.');
  }
  req.body.email = email.trim().toLowerCase();
  next();
};

const validateOTPVerify = (req, res, next) => {
  const { email, otp } = req.body;
  if (!email || !EMAIL_RE.test(email.trim())) {
    return bad(res, 'A valid email address is required.');
  }
  if (!otp || typeof otp !== 'string' || !/^\d{6}$/.test(otp.trim())) {
    return bad(res, 'OTP must be a 6-digit number.');
  }
  req.body.email = email.trim().toLowerCase();
  req.body.otp   = otp.trim();
  next();
};

// ── Devices ───────────────────────────────────────────────────────────
const validateCreateDevice = (req, res, next) => {
  const { name, location, power_kw } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length < 1) {
    return bad(res, 'Device name is required.');
  }
  if (!location || typeof location !== 'string' || location.trim().length < 1) {
    return bad(res, 'Device location is required.');
  }
  const power = parseFloat(power_kw);
  if (isNaN(power) || power <= 0) {
    return bad(res, 'Power rating must be a positive number.');
  }
  req.body.name     = name.trim();
  req.body.location = location.trim();
  req.body.power_kw = power;
  next();
};

// ── MongoDB ObjectId param ────────────────────────────────────────────
const validateObjectId = (paramName) => (req, res, next) => {
  const id = req.params[paramName];
  if (!id || !/^[a-f\d]{24}$/i.test(id)) {
    return res.status(400).json({ success: false, message: `Invalid ${paramName}.` });
  }
  next();
};

module.exports = {
  validateLogin,
  validateRegister,
  validateOTPRequest,
  validateOTPVerify,
  validateCreateDevice,
  validateObjectId,
};
