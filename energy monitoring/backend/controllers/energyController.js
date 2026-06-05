const EnergyUsage = require('../models/EnergyUsage');
const Prediction  = require('../models/Prediction');
const aiService   = require('../services/aiService');
const { CO2_KG_PER_KWH, TARIFF_INR_PER_KWH } = require('../config/constants');

// ── hasData ───────────────────────────────────────────────────────────
const hasData = async (req, res) => {
  try {
    const count = await EnergyUsage.countDocuments({ userId: req.user.userId });
    res.json({ success: true, hasData: count > 0, count });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── getSummary ────────────────────────────────────────────────────────
const getSummary = async (req, res) => {
  try {
    const userId = req.user.userId;
    const docs = await EnergyUsage.find({ userId }).sort({ date: 1 });

    if (!docs.length) {
      return res.json({ hasData: false, message: 'No energy data found' });
    }

    const totalKwh = docs.reduce((sum, d) => sum + d.energyConsumed, 0);
    const maxKw    = Math.max(...docs.map(d => d.energyConsumed));
    const avgKw    = totalKwh / docs.length;
    const dates    = docs.map(d => d.date);

    res.json({
      hasData: true,
      avg_active_power_kw:  Math.round(avgKw    * 1000) / 1000,
      max_active_power_kw:  Math.round(maxKw    * 1000) / 1000,
      total_kwh:            Math.round(totalKwh * 100)  / 100,
      estimated_cost:       Math.round(totalKwh * TARIFF_INR_PER_KWH * 100) / 100,
      co2_emissions_kg:     Math.round(totalKwh * CO2_KG_PER_KWH    * 100) / 100,
      date_range: {
        start: dates[0].toISOString().split('T')[0],
        end:   dates[dates.length - 1].toISOString().split('T')[0]
      },
      record_count: docs.length
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── getDaily ──────────────────────────────────────────────────────────
const getDaily = async (req, res) => {
  try {
    const userId = req.user.userId;
    const docs   = await EnergyUsage.find({ userId }).sort({ date: 1 });

    if (!docs.length) return res.json({ hasData: false, daily: [] });

    const dailyMap = {};
    docs.forEach(d => {
      const key = d.date.toISOString().split('T')[0];
      dailyMap[key] = (dailyMap[key] || 0) + d.energyConsumed;
    });

    const daily = Object.entries(dailyMap).map(([date, kwh]) => ({
      date,
      kwh: Math.round(kwh * 100) / 100
    }));

    res.json({ hasData: true, daily });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── getHourly ─────────────────────────────────────────────────────────
const getHourly = async (req, res) => {
  try {
    const userId = req.user.userId;
    const docs   = await EnergyUsage.find({ userId });

    if (!docs.length) return res.json({ hasData: false, hourly: [] });

    const hourlyMap = {};
    for (let i = 0; i < 24; i++) hourlyMap[i] = { total: 0, count: 0 };

    docs.forEach(d => {
      const hour = d.date.getHours();
      hourlyMap[hour].total += d.energyConsumed;
      hourlyMap[hour].count += 1;
    });

    const hourly = Object.entries(hourlyMap).map(([hour, val]) => ({
      hour:   parseInt(hour),
      avg_kw: val.count > 0 ? Math.round((val.total / val.count) * 1000) / 1000 : 0
    }));

    res.json({ hasData: true, hourly });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── getSubmetering ────────────────────────────────────────────────────
const getSubmetering = async (req, res) => {
  try {
    const userId = req.user.userId;
    const docs   = await EnergyUsage.find({ userId });

    if (!docs.length) return res.json({ hasData: false, devices: {}, total: 0 });

    const deviceMap = {};
    docs.forEach(d => {
      const dev = d.device || 'Unknown';
      deviceMap[dev] = (deviceMap[dev] || 0) + d.energyConsumed;
    });

    const total = Object.values(deviceMap).reduce((a, b) => a + b, 0);
    const devices = {};
    Object.entries(deviceMap).forEach(([k, v]) => {
      devices[k] = Math.round(v * 100) / 100;
    });

    res.json({ hasData: true, devices, total: Math.round(total * 100) / 100 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── getWeeklyComparison ───────────────────────────────────────────────
const getWeeklyComparison = async (req, res) => {
  try {
    const userId = req.user.userId;
    const docs   = await EnergyUsage.find({ userId }).sort({ date: -1 });

    if (!docs.length) return res.json({ hasData: false, this_week: [], last_week: [] });

    const dateMap = {};
    docs.forEach(d => {
      const key = d.date.toISOString().split('T')[0];
      dateMap[key] = (dateMap[key] || 0) + d.energyConsumed;
    });

    const sorted = Object.entries(dateMap).sort((a, b) => b[0].localeCompare(a[0]));
    const thisWeek = sorted.slice(0, 7).reverse().map(([date, kwh]) => ({ date, kwh: Math.round(kwh * 100) / 100 }));
    const lastWeek = sorted.slice(7, 14).reverse().map(([date, kwh]) => ({ date, kwh: Math.round(kwh * 100) / 100 }));

    res.json({ hasData: true, this_week: thisWeek, last_week: lastWeek });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── predict (single value) ────────────────────────────────────────────
const predict = async (req, res) => {
  try {
    const userId = req.user.userId;
    const docs   = await EnergyUsage.find({ userId }).sort({ date: 1 });

    if (!docs.length) {
      return res.json({ hasData: false, message: 'No data available for prediction. Please upload your energy data first.' });
    }

    const total     = docs.reduce((sum, d) => sum + d.energyConsumed, 0);
    const avg       = total / docs.length;
    const recent    = docs.slice(-7);
    const recentAvg = recent.reduce((sum, d) => sum + d.energyConsumed, 0) / recent.length;
    const predicted = recentAvg * 0.7 + avg * 0.3;

    res.json({
      hasData: true,
      algorithm: 'User Data Trend',
      historical_records: docs.length,
      overall_average:    Math.round(avg       * 1000) / 1000,
      recent_average:     Math.round(recentAvg * 1000) / 1000,
      predicted_kwh:      Math.round(predicted * 1000) / 1000
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── getForecast (7-day, persisted) ────────────────────────────────────
const getForecast = async (req, res) => {
  try {
    const userId = req.user.userId;
    const docs   = await EnergyUsage.find({ userId }).sort({ date: 1 });

    if (!docs.length) return res.json({ hasData: false, forecast: [] });

    // Return cached forecast if generated within the last 6 hours
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const cached = await Prediction.findOne({ userId, generatedAt: { $gt: sixHoursAgo } })
      .sort({ generatedAt: -1 });
    if (cached) {
      return res.json({
        hasData:   true,
        forecast:  cached.forecast,
        algorithm: cached.algorithm,
        source:    cached.source,
        metrics:   cached.metrics,
        cached:    true
      });
    }

    // Build user context for ML service
    const totalKwh  = docs.reduce((s, d) => s + d.energyConsumed, 0);
    const avgKwh    = totalKwh / docs.length;
    const deviceMap = {};
    docs.forEach(d => {
      const dev = (d.device || 'Unknown').toLowerCase();
      deviceMap[dev] = (deviceMap[dev] || 0) + d.energyConsumed;
    });
    const getAvg = (keywords) => {
      const kwh = Object.entries(deviceMap)
        .filter(([k]) => keywords.some(kw => k.includes(kw)))
        .reduce((s, [, v]) => s + v, 0);
      return Math.round((kwh / docs.length) * 1000) / 1000;
    };
    const userContext = {
      avgKwh: Math.round(avgKwh * 1000) / 1000,
      sub1:   getAvg(['kitchen', 'microwave', 'oven', 'fridge']),
      sub2:   getAvg(['washer', 'dryer', 'laundry']),
      sub3:   getAvg(['ac', 'air', 'hvac', 'heater', 'heat', 'cool'])
    };

    // Try ML service first, fall back to statistical method
    const result = await aiService.generateForecast(userContext, 'rf');

    const saved = await Prediction.create({
      userId,
      algorithm: result.model_used || result.algorithm || 'Unknown',
      source:    result.source     || 'user_data',
      metrics:   result.metrics    || {},
      forecast:  result.forecast.map(f => ({
        date:           f.date,
        predicted_kwh:  f.predicted_kwh,
        predicted_cost: f.predicted_cost ?? null,
        co2_kg:         f.co2_kg         ?? null
      }))
    });

    res.json({
      hasData:   true,
      forecast:  saved.forecast,
      algorithm: saved.algorithm,
      source:    saved.source,
      metrics:   saved.metrics,
      cached:    false
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── getAllRecords ─────────────────────────────────────────────────────
const getAllRecords = async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit  = Math.min(parseInt(req.query.limit) || 100, 500);
    const docs   = await EnergyUsage.find({ userId }).sort({ date: -1 }).limit(limit);
    res.json({ success: true, records: docs, count: docs.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── addRecord (manual save from OCR) ─────────────────────────────────
const addRecord = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { date, energyConsumed, device } = req.body;

    if (!date || energyConsumed == null) {
      return res.status(400).json({ success: false, message: 'date and energyConsumed are required' });
    }
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid date format' });
    }
    const parsed = parseFloat(energyConsumed);
    if (isNaN(parsed) || parsed <= 0) {
      return res.status(400).json({ success: false, message: 'energyConsumed must be a positive number' });
    }

    const record = await EnergyUsage.create({
      userId,
      date:           parsedDate,
      energyConsumed: parsed,
      device:         device || 'Bill Image (OCR)'
    });

    res.status(201).json({ success: true, record });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── deleteAllRecords (for data reset) ────────────────────────────────
const deleteAllRecords = async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await EnergyUsage.deleteMany({ userId });
    // Also clear cached predictions
    await Prediction.deleteMany({ userId });
    res.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  hasData, getSummary, getDaily, getHourly, getSubmetering,
  getWeeklyComparison, predict, getForecast, getAllRecords, addRecord, deleteAllRecords
};
