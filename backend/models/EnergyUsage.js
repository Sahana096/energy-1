const mongoose = require('mongoose');

const energyUsageSchema = new mongoose.Schema({
  userId:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date:            { type: Date,   required: true },
  energyConsumed:  { type: Number, required: true, min: 0 },
  device:          { type: String, default: 'Unknown', trim: true }
}, { timestamps: true });

// Compound index for fast per-user time-range queries
energyUsageSchema.index({ userId: 1, date: -1 });

module.exports = mongoose.model('EnergyUsage', energyUsageSchema);
