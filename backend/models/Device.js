const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name:       { type: String, required: true, trim: true },
  location:   { type: String, required: true, trim: true },
  icon:       { type: String, required: true, default: 'plug' },
  power_kw:   { type: Number, required: true, min: 0 },
  status:     { type: Boolean, default: true },
  energy_kwh: { type: Number, default: 0, min: 0 }
}, { timestamps: true });

deviceSchema.index({ userId: 1 });

module.exports = mongoose.model('Device', deviceSchema);
