/**
 * carbonController — all CO₂ calculations live here.
 *
 * Formula: CO2_kg = energy_kWh × CO2_KG_PER_KWH
 * Emission factor source: India CEA 2023 — 0.82 kg CO₂/kWh
 */
const EnergyUsage = require('../models/EnergyUsage');
const {
  CO2_KG_PER_KWH,
  CO2_KG_PER_TREE_PER_YEAR,
  NATIONAL_AVG_DAILY_KWH
} = require('../config/constants');

/** Apply CO₂ formula and round to 2 dp. */
function toCO2(kwh) {
  return Math.round(kwh * CO2_KG_PER_KWH * 100) / 100;
}

/** Trees equivalent (rounded to 1 dp). */
function toTrees(co2_kg) {
  return Math.round((co2_kg / CO2_KG_PER_TREE_PER_YEAR) * 10) / 10;
}

/** Aggregate EnergyUsage docs into a { 'YYYY-MM-DD': kWh } map. */
function buildDailyMap(docs) {
  const map = {};
  docs.forEach(d => {
    const key = d.date.toISOString().split('T')[0];
    map[key] = (map[key] || 0) + d.energyConsumed;
  });
  return map;
}

// ── GET /api/carbon/metrics ───────────────────────────────────────────
const getCarbonMetrics = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const docs   = await EnergyUsage.find({ userId }).sort({ date: 1 });

    if (!docs.length) {
      return res.json({ success: true, hasData: false, message: 'No energy data found.' });
    }

    const dailyMap    = buildDailyMap(docs);
    const dailyValues = Object.values(dailyMap);
    const totalKwh    = dailyValues.reduce((s, v) => s + v, 0);
    const avgDailyKwh = totalKwh / dailyValues.length;

    // "Today" = most recent day in the dataset
    const sortedDates = Object.keys(dailyMap).sort();
    const todayKwh    = dailyMap[sortedDates[sortedDates.length - 1]] || avgDailyKwh;

    // "This month" = last 30 days of data
    const last30 = sortedDates.slice(-30);
    const monthKwh = last30.reduce((s, d) => s + dailyMap[d], 0);

    // "This year" = all data (proxy for year if < 365 days available)
    const yearKwh = totalKwh;

    const todayCo2 = toCO2(todayKwh);
    const monthCo2 = toCO2(monthKwh);
    const yearCo2  = toCO2(yearKwh);

    const percentDiff = +((avgDailyKwh - NATIONAL_AVG_DAILY_KWH) / NATIONAL_AVG_DAILY_KWH * 100).toFixed(1);

    res.json({
      success: true,
      hasData: true,
      emission_factor: { value: CO2_KG_PER_KWH, unit: 'kg CO₂/kWh', source: 'India CEA 2023' },
      today: {
        kwh:    Math.round(todayKwh * 100) / 100,
        co2_kg: todayCo2,
        trees:  toTrees(todayCo2)
      },
      month: {
        kwh:    Math.round(monthKwh * 100) / 100,
        co2_kg: monthCo2,
        trees:  toTrees(monthCo2)
      },
      year: {
        kwh:    Math.round(yearKwh * 100) / 100,
        co2_kg: yearCo2,
        trees:  toTrees(yearCo2)
      },
      vsNationalAvg: {
        user_daily_kwh:     Math.round(avgDailyKwh * 100) / 100,
        national_daily_kwh: NATIONAL_AVG_DAILY_KWH,
        percent_diff:       percentDiff
      }
    });
  } catch (err) { next(err); }
};

// ── GET /api/carbon/trends ────────────────────────────────────────────
const getCarbonTrends = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const docs   = await EnergyUsage.find({ userId }).sort({ date: 1 });

    if (!docs.length) {
      return res.json({ success: true, hasData: false, monthly: [], weekly: [] });
    }

    const dailyMap = buildDailyMap(docs);
    const daily    = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, kwh]) => ({ date, kwh }));

    // ── Monthly buckets (group by calendar month) ─────────────────────
    const monthMap = {};
    daily.forEach(({ date, kwh }) => {
      const d   = new Date(date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap[key] = (monthMap[key] || 0) + kwh;
    });

    const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                         'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthly = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([key, kwh]) => {
        const [year, month] = key.split('-');
        const co2 = toCO2(kwh);
        return {
          label:  `${MONTH_NAMES[parseInt(month) - 1]} ${year}`,
          kwh:    Math.round(kwh * 10) / 10,
          co2_kg: co2
        };
      });

    // ── Weekly buckets (last 12 weeks) ────────────────────────────────
    const weekly = [];
    for (let i = 0; i < daily.length; i += 7) {
      const chunk  = daily.slice(i, i + 7);
      const kwh    = chunk.reduce((s, d) => s + d.kwh, 0);
      const co2    = toCO2(kwh);
      const start  = chunk[0].date;
      weekly.push({
        label:  `w/c ${start}`,
        kwh:    Math.round(kwh * 10) / 10,
        co2_kg: co2
      });
    }

    res.json({
      success: true,
      hasData: true,
      emission_factor: CO2_KG_PER_KWH,
      monthly,
      weekly: weekly.slice(-12)
    });
  } catch (err) { next(err); }
};

// ── GET /api/carbon/breakdown ─────────────────────────────────────────
const getCarbonBreakdown = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const docs   = await EnergyUsage.find({ userId });

    if (!docs.length) {
      return res.json({ success: true, hasData: false, total_kwh: 0, total_co2_kg: 0, categories: [] });
    }

    // Aggregate by device
    const deviceMap = {};
    docs.forEach(d => {
      const dev = (d.device || 'Unknown').trim();
      deviceMap[dev] = (deviceMap[dev] || 0) + d.energyConsumed;
    });

    const totalKwh = Object.values(deviceMap).reduce((a, b) => a + b, 0);
    const totalCo2 = toCO2(totalKwh);

    // Check if all data is unknown
    const allUnknown = Object.keys(deviceMap).every(k =>
      k.toLowerCase() === 'unknown' || k.toLowerCase() === 'other'
    );

    let catMap;
    if (allUnknown && totalKwh > 0) {
      // Estimate by time-of-day (same logic as submetering)
      const hourTotals = {};
      docs.forEach(d => {
        const h = d.date.getHours();
        hourTotals[h] = (hourTotals[h] || 0) + d.energyConsumed;
      });

      catMap = { HVAC: 0, Kitchen: 0, Laundry: 0, Lighting: 0, Other: 0 };
      Object.entries(hourTotals).forEach(([h, kwh]) => {
        const hour = parseInt(h);
        if (hour >= 12 && hour < 20) {
          catMap.HVAC     += kwh * 0.45; catMap.Kitchen  += kwh * 0.25;
          catMap.Lighting += kwh * 0.15; catMap.Laundry  += kwh * 0.10; catMap.Other += kwh * 0.05;
        } else if (hour >= 6 && hour < 12) {
          catMap.Kitchen  += kwh * 0.40; catMap.HVAC     += kwh * 0.25;
          catMap.Lighting += kwh * 0.15; catMap.Laundry  += kwh * 0.15; catMap.Other += kwh * 0.05;
        } else if (hour >= 20 && hour < 23) {
          catMap.Lighting += kwh * 0.30; catMap.Kitchen  += kwh * 0.30;
          catMap.HVAC     += kwh * 0.25; catMap.Laundry  += kwh * 0.10; catMap.Other += kwh * 0.05;
        } else {
          catMap.HVAC     += kwh * 0.35; catMap.Other    += kwh * 0.35;
          catMap.Lighting += kwh * 0.15; catMap.Kitchen  += kwh * 0.10; catMap.Laundry += kwh * 0.05;
        }
      });
    } else {
      // Use actual device names
      catMap = deviceMap;
    }

    const COLORS = {
      HVAC: '#FFD700', Kitchen: '#ff6b35', Laundry: '#4facfe',
      Lighting: '#43e97b', Other: '#b8960c'
    };
    const PALETTE = ['#FFD700', '#ff6b35', '#4facfe', '#43e97b', '#b8960c', '#ff006e', '#ffffff'];

    const categories = Object.entries(catMap)
      .filter(([, kwh]) => kwh > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([name, kwh], i) => ({
        name,
        kwh:     Math.round(kwh * 100) / 100,
        co2_kg:  toCO2(kwh),
        percent: totalKwh ? Math.round((kwh / totalKwh) * 1000) / 10 : 0,
        color:   COLORS[name] || PALETTE[i % PALETTE.length]
      }));

    res.json({
      success: true,
      hasData: true,
      emission_factor: CO2_KG_PER_KWH,
      total_kwh:    Math.round(totalKwh * 100) / 100,
      total_co2_kg: totalCo2,
      categories,
      estimated: allUnknown
    });
  } catch (err) { next(err); }
};

// ── GET /api/carbon/goals ─────────────────────────────────────────────
const getCarbonGoals = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const docs   = await EnergyUsage.find({ userId }).sort({ date: 1 });

    if (!docs.length) {
      return res.json({ success: true, hasData: false, goals: [], offsets: [] });
    }

    const totalKwh    = docs.reduce((s, d) => s + d.energyConsumed, 0);
    const totalCo2    = toCO2(totalKwh);

    // Daily average CO₂ for the "reduce by 10%" goal baseline
    const dailyMap    = buildDailyMap(docs);
    const days        = Object.keys(dailyMap).length;
    const avgDailyCo2 = toCO2(totalKwh / days);

    // Goal 1: reduce total CO₂ by 10% vs current
    const reduceTarget  = Math.round(totalCo2 * 0.9);
    // Goal 2: offset 500 kg
    const offsetTarget  = 500;
    // Goal 3: daily average below national average CO₂
    const nationalDailyCo2 = toCO2(NATIONAL_AVG_DAILY_KWH);

    const goals = [
      {
        id:              1,
        title:           'Reduce total CO₂ by 10%',
        description:     `Cut your total emissions from ${totalCo2} kg to ${reduceTarget} kg.`,
        target_co2_kg:   reduceTarget,
        current_co2_kg:  Math.round(totalCo2),
        deadline:        '2026-12-31',
        status:          totalCo2 <= reduceTarget ? 'completed' : 'active'
      },
      {
        id:              2,
        title:           'Offset 500 kg CO₂',
        description:     'Reach 500 kg of total CO₂ offset through renewable actions.',
        target_co2_kg:   offsetTarget,
        current_co2_kg:  Math.min(Math.round(totalCo2), offsetTarget),
        deadline:        '2026-12-31',
        status:          totalCo2 >= offsetTarget ? 'completed' : 'active'
      },
      {
        id:              3,
        title:           'Stay below national daily average',
        description:     `Keep daily CO₂ below ${nationalDailyCo2} kg (national avg).`,
        target_co2_kg:   Math.round(nationalDailyCo2),
        current_co2_kg:  Math.round(avgDailyCo2),
        deadline:        '2026-06-01',
        status:          avgDailyCo2 <= nationalDailyCo2 ? 'completed' : 'active'
      }
    ];

    const offsets = [
      { type: 'Solar Panels',    saved_kg: Math.round(toCO2(120 / CO2_KG_PER_KWH)), cost: 2500, roi_years: 4 },
      { type: 'Tree Planting',   saved_kg: 50,  cost: 25,  roi_years: 0 },
      { type: 'LED Upgrade',     saved_kg: Math.round(toCO2(35 / CO2_KG_PER_KWH)),  cost: 80,   roi_years: 1 },
      { type: 'Smart Thermostat',saved_kg: Math.round(toCO2(90 / CO2_KG_PER_KWH)),  cost: 200,  roi_years: 2 }
    ];

    res.json({
      success: true,
      hasData: true,
      emission_factor: CO2_KG_PER_KWH,
      total_co2_kg: Math.round(totalCo2),
      goals,
      offsets
    });
  } catch (err) { next(err); }
};

module.exports = { getCarbonMetrics, getCarbonTrends, getCarbonBreakdown, getCarbonGoals };
