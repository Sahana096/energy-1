/**
 * mlController — exposes ML service predictions via the Node.js API.
 * All forecast results are persisted to MongoDB (Prediction collection).
 * Every response includes evaluation metrics from the trained model.
 */
const aiService  = require('../services/aiService');
const Prediction = require('../models/Prediction');
const EnergyUsage = require('../models/EnergyUsage');

// ── helpers ───────────────────────────────────────────────────────────
function parseParams(req) {
  const now = new Date();
  return {
    hour:      parseInt(req.query.hour      ?? now.getHours()),
    dayofweek: parseInt(req.query.dayofweek ?? now.getDay()),
    month:     parseInt(req.query.month     ?? (now.getMonth() + 1)),
    sub1:      parseFloat(req.query.sub1    ?? 0),
    sub2:      parseFloat(req.query.sub2    ?? 0),
    sub3:      parseFloat(req.query.sub3    ?? 0)
  };
}

/** Compute sub-metering averages from the user's EnergyUsage records. */
async function getUserContext(userId) {
  const docs = await EnergyUsage.find({ userId }).sort({ date: -1 }).limit(500);
  if (!docs.length) return {};

  const totalKwh = docs.reduce((s, d) => s + d.energyConsumed, 0);
  const avgKwh   = totalKwh / docs.length;

  // Group by device to approximate sub-metering
  const deviceMap = {};
  docs.forEach(d => {
    const dev = (d.device || 'Unknown').toLowerCase();
    deviceMap[dev] = (deviceMap[dev] || 0) + d.energyConsumed;
  });
  const total = Object.values(deviceMap).reduce((a, b) => a + b, 0) || 1;

  const getAvg = (keywords) => {
    const kwh = Object.entries(deviceMap)
      .filter(([k]) => keywords.some(kw => k.includes(kw)))
      .reduce((s, [, v]) => s + v, 0);
    return Math.round((kwh / docs.length) * 1000) / 1000;
  };

  return {
    avgKwh: Math.round(avgKwh * 1000) / 1000,
    sub1:   getAvg(['kitchen', 'microwave', 'oven', 'fridge']),
    sub2:   getAvg(['washer', 'dryer', 'laundry']),
    sub3:   getAvg(['ac', 'air', 'hvac', 'heater', 'heat', 'cool'])
  };
}

// ── POST /api/ml/predict ──────────────────────────────────────────────
const predict = async (req, res, next) => {
  try {
    const p      = parseParams(req);
    const result = await aiService.generatePrediction(
      p.hour, p.dayofweek, p.month, p.sub1, p.sub2, p.sub3
    );
    res.json({
      success: true,
      data: {
        algorithm:    result.algorithm,
        source:       result.source,
        input:        result.input || p,
        predicted_kw: result.predicted_kw,
        metrics:      result.metrics || {}
      }
    });
  } catch (err) { next(err); }
};

// ── GET /api/ml/forecast ──────────────────────────────────────────────
const forecast = async (req, res, next) => {
  try {
    const userId     = req.user.userId;
    const modelType  = req.query.model || 'rf';

    // Check cache (6-hour TTL, same source)
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const cached = await Prediction.findOne({ userId, generatedAt: { $gt: sixHoursAgo } })
      .sort({ generatedAt: -1 });
    if (cached) {
      return res.json({
        success: true,
        data: {
          algorithm:  cached.algorithm,
          source:     cached.source,
          metrics:    cached.metrics,
          forecast:   cached.forecast,
          cached:     true,
          cachedAt:   cached.generatedAt
        }
      });
    }

    // Get user context for better ML predictions
    const userContext = await getUserContext(userId);
    const result      = await aiService.generateForecast(userContext, modelType);

    // Persist to MongoDB
    const saved = await Prediction.create({
      userId,
      algorithm:   result.model_used || 'Unknown',
      source:      result.source     || 'user_data',
      metrics:     result.metrics    || {},
      forecast:    result.forecast.map(f => ({
        date:           f.date,
        predicted_kwh:  f.predicted_kwh,
        predicted_cost: f.predicted_cost ?? null,
        co2_kg:         f.co2_kg         ?? null
      }))
    });

    res.json({
      success: true,
      data: {
        algorithm: saved.algorithm,
        source:    saved.source,
        metrics:   saved.metrics,
        forecast:  saved.forecast,
        cached:    false
      }
    });
  } catch (err) { next(err); }
};

// ── GET /api/ml/anomaly ───────────────────────────────────────────────
const anomaly = async (req, res, next) => {
  try {
    const power_kw = parseFloat(req.query.power_kw ?? 1.0);
    const sub1     = parseFloat(req.query.sub1     ?? 0);
    const sub2     = parseFloat(req.query.sub2     ?? 0);
    const sub3     = parseFloat(req.query.sub3     ?? 0);
    const result   = await aiService.generateAnomalyData(power_kw, sub1, sub2, sub3);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

// ── GET /api/ml/metrics ───────────────────────────────────────────────
const metrics = async (req, res, next) => {
  try {
    const result = await aiService.generateMetrics();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

// ── GET /api/ml/classify ──────────────────────────────────────────────
const classify = async (req, res, next) => {
  try {
    const power_kw = parseFloat(req.query.power_kw ?? 1.0);
    const sub1     = parseFloat(req.query.sub1     ?? 0);
    const sub2     = parseFloat(req.query.sub2     ?? 0);
    const sub3     = parseFloat(req.query.sub3     ?? 0);
    const hour     = parseInt(req.query.hour       ?? new Date().getHours());
    const result   = await aiService.classifyUsage(power_kw, sub1, sub2, sub3, hour);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

// ── GET /api/ml/clusters ──────────────────────────────────────────────
const clusters = async (req, res, next) => {
  try {
    const result = await aiService.generateClusters();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

// ── GET /api/ml/compare ───────────────────────────────────────────────
const compare = async (req, res, next) => {
  try {
    const p      = parseParams(req);
    const result = await aiService.compareModels(
      p.hour, p.dayofweek, p.month, p.sub1, p.sub2, p.sub3
    );
    if (!result) {
      return res.status(503).json({
        success: false,
        message: 'ML service unavailable. Start the Python service to compare models.'
      });
    }
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

// ── GET /api/ml/prediction-vs-actual ─────────────────────────────────
/** For each of the user's recent records, run the ML model and return
 *  predicted vs actual so the chart shows a meaningful comparison. */
const predictionVsActual = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const limit  = Math.min(parseInt(req.query.limit ?? 50), 100);
    const docs   = await EnergyUsage.find({ userId }).sort({ date: 1 }).limit(limit);

    if (!docs.length) {
      return res.json({ success: true, hasData: false, records: [] });
    }

    // For each record, call the ML model with that record's time features
    const records = [];
    for (const doc of docs) {
      const hour      = doc.date.getHours();
      const dayofweek = doc.date.getDay();
      const month     = doc.date.getMonth() + 1;

      let predicted = null;
      try {
        const result = await aiService.generatePrediction(hour, dayofweek, month);
        predicted = result?.predicted_kw ?? null;
      } catch (e) { /* skip */ }

      records.push({
        date:     doc.date.toISOString(),
        label:    doc.date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
        actual:   Math.round(doc.energyConsumed * 1000) / 1000,
        predicted: predicted !== null ? Math.round(predicted * 1000) / 1000 : null
      });
    }

    res.json({ success: true, hasData: true, records });
  } catch (err) { next(err); }
};
/** Return the last N stored forecasts for the authenticated user. */
const history = async (req, res, next) => {
  try {
    const limit   = Math.min(parseInt(req.query.limit ?? 10), 50);
    const records = await Prediction.find({ userId: req.user.userId })
      .sort({ generatedAt: -1 })
      .limit(limit)
      .select('-__v');
    res.json({ success: true, data: { count: records.length, predictions: records } });
  } catch (err) { next(err); }
};

module.exports = { predict, forecast, anomaly, metrics, classify, clusters, compare, history, predictionVsActual };
