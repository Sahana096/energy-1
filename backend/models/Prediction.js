const mongoose = require('mongoose');

const forecastEntrySchema = new mongoose.Schema({
  date:          { type: String, required: true }, // YYYY-MM-DD
  predicted_kwh: { type: Number, required: true, min: 0 },
  predicted_cost: { type: Number, default: null },
  co2_kg:        { type: Number, default: null }
}, { _id: false });

const metricsSchema = new mongoose.Schema({
  mae:  { type: Number, default: null },
  rmse: { type: Number, default: null },
  r2:   { type: Number, default: null }
}, { _id: false });

const predictionSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  generatedAt: { type: Date, default: Date.now },
  algorithm:   { type: String, default: 'User Data Trend' },
  source:      { type: String, enum: ['ml_service', 'user_data'], default: 'user_data' },
  metrics:     { type: metricsSchema, default: () => ({}) },
  forecast:    { type: [forecastEntrySchema], required: true }
}, { timestamps: true });

predictionSchema.index({ userId: 1, generatedAt: -1 });

module.exports = mongoose.model('Prediction', predictionSchema);
