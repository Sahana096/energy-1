/**
 * Centralised error-handling middleware.
 * Must be registered AFTER all routes in server.js.
 */

// Multer file-size / file-type errors
const multer = require('multer');

const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  // Multer errors (file too large, wrong type)
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'File too large. Maximum size is 10 MB.'
      : `Upload error: ${err.message}`;
    return res.status(400).json({ success: false, message });
  }

  // Custom file-filter rejection from multer
  if (err && err.message && err.message.includes('Only JPG')) {
    return res.status(400).json({ success: false, message: err.message });
  }

  // Mongoose validation errors
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message).join(', ');
    return res.status(400).json({ success: false, message: messages });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({ success: false, message: `${field} already exists.` });
  }

  // Mongoose cast error (bad ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'Invalid ID format.' });
  }

  // JWT errors (shouldn't reach here normally — caught in auth middleware)
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Token expired.' });
  }

  // Generic server error — don't leak stack traces in production
  const isDev = process.env.NODE_ENV !== 'production';
  console.error('[Error]', err.message);
  if (isDev) console.error(err.stack);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error.',
    ...(isDev && { stack: err.stack })
  });
};

module.exports = errorHandler;
