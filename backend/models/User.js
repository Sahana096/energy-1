const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:  { type: String, required: true },
  name:      { type: String, required: true, trim: true },
  role:      { type: String, enum: ['user', 'admin'], default: 'user' },
  otp:       { type: String, default: null },
  otpExpiry: { type: Date,   default: null },
  lastLogin: { type: Date,   default: null }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
