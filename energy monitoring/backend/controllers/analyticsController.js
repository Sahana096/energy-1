const EnergyUsage = require('../models/EnergyUsage');
const { CO2_KG_PER_KWH, TARIFF_INR_PER_KWH } = require('../config/constants');

// ── Bill calculation helper ───────────────────────────────────────────
// India tiered tariff approximation (₹/kWh):
//   0–100 kWh  → ₹3.50
//   101–300    → ₹5.00
//   301–500    → ₹6.50
//   >500       → ₹7.50
// Fixed charges: ₹50/month. Taxes: 5% electricity duty.
function calculateBill(totalKwh) {
  let energy = 0;
  if (totalKwh <= 100) {
    energy = totalKwh * 3.50;
  } else if (totalKwh <= 300) {
    energy = 100 * 3.50 + (totalKwh - 100) * 5.00;
  } else if (totalKwh <= 500) {
    energy = 100 * 3.50 + 200 * 5.00 + (totalKwh - 300) * 6.50;
  } else {
    energy = 100 * 3.50 + 200 * 5.00 + 200 * 6.50 + (totalKwh - 500) * 7.50;
  }
  const fixed  = 50;
  const subtotal = energy + fixed;
  const tax    = subtotal * 0.05;
  const total  = subtotal + tax;
  return {
    energy_charge: Math.round(energy  * 100) / 100,
    fixed_charge:  fixed,
    tax:           Math.round(tax     * 100) / 100,
    total:         Math.round(total   * 100) / 100,
    rate_per_kwh:  totalKwh > 0 ? Math.round((total / totalKwh) * 100) / 100 : TARIFF_INR_PER_KWH
  };
}

// ── GET /api/analytics/summary ────────────────────────────────────────
const getSummary = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const docs   = await EnergyUsage.find({ userId });

    if (!docs.length) {
      return res.json({ success: true, hasData: false, message: 'No energy data found' });
    }

    const totalKwh = docs.reduce((s, d) => s + d.energyConsumed, 0);
    const avgKw    = totalKwh / docs.length;
    const maxKw    = Math.max(...docs.map(d => d.energyConsumed));
    const dates    = docs.map(d => d.date).sort((a, b) => a - b);
    const bill     = calculateBill(totalKwh);

    res.json({
      success: true,
      hasData: true,
      total_consumption_kwh: Math.round(totalKwh * 100) / 100,
      avg_active_power_kw:   Math.round(avgKw    * 1000) / 1000,
      max_active_power_kw:   Math.round(maxKw    * 1000) / 1000,
      co2_emissions_kg:      Math.round(totalKwh * CO2_KG_PER_KWH * 100) / 100,
      date_range: {
        start: dates[0].toISOString().split('T')[0],
        end:   dates[dates.length - 1].toISOString().split('T')[0]
      },
      bill
    });
  } catch (err) { next(err); }
};

// ── GET /api/analytics/trends ─────────────────────────────────────────
const getTrends = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const docs   = await EnergyUsage.find({ userId }).sort({ date: 1 });

    if (!docs.length) {
      return res.json({ success: true, hasData: false, labels: [], values: [], costs: [], trend: 'none' });
    }

    const dailyMap = {};
    docs.forEach(d => {
      const key = d.date.toISOString().split('T')[0];
      dailyMap[key] = (dailyMap[key] || 0) + d.energyConsumed;
    });

    const entries = Object.entries(dailyMap).slice(-14);
    const labels  = entries.map(([date]) => date);
    const values  = entries.map(([, kwh]) => Math.round(kwh * 100) / 100);
    const costs   = values.map(kwh => Math.round(kwh * TARIFF_INR_PER_KWH * 100) / 100);

    res.json({
      success: true,
      hasData: true,
      labels,
      values,
      costs,
      trend: values[values.length - 1] > values[0] ? 'increasing' : 'decreasing'
    });
  } catch (err) { next(err); }
};

// ── GET /api/analytics/peak-hours ────────────────────────────────────
const getPeakHours = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const docs   = await EnergyUsage.find({ userId });

    if (!docs.length) {
      return res.json({ success: true, hasData: false, peak_hours: [], off_peak_hours: [], average: 0 });
    }

    const hourlyMap = {};
    for (let i = 0; i < 24; i++) hourlyMap[i] = { total: 0, count: 0 };

    docs.forEach(d => {
      const hour = d.date.getHours();
      hourlyMap[hour].total += d.energyConsumed;
      hourlyMap[hour].count += 1;
    });

    const hourly = Object.entries(hourlyMap)
      .map(([hour, val]) => ({
        hour:   parseInt(hour),
        avg_kw: val.count > 0 ? Math.round((val.total / val.count) * 1000) / 1000 : 0
      }))
      .filter(h => h.avg_kw > 0);

    const sorted = [...hourly].sort((a, b) => b.avg_kw - a.avg_kw);
    const avg    = hourly.reduce((s, h) => s + h.avg_kw, 0) / (hourly.length || 1);

    res.json({
      success: true,
      hasData: true,
      peak_hours:     sorted.slice(0, 3),
      off_peak_hours: sorted.slice(-3),
      average:        Math.round(avg * 1000) / 1000
    });
  } catch (err) { next(err); }
};

// ── GET /api/analytics/submetering ───────────────────────────────────
const getSubmeteringBreakdown = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const docs   = await EnergyUsage.find({ userId });

    if (!docs.length) {
      return res.json({ success: true, hasData: false, kitchen: {}, laundry: {}, hvac: {}, total: 0 });
    }

    const deviceMap = {};
    docs.forEach(d => {
      const dev = d.device || 'Unknown';
      deviceMap[dev] = (deviceMap[dev] || 0) + d.energyConsumed;
    });

    const total = Object.values(deviceMap).reduce((a, b) => a + b, 0);

    const getCategory = (name) => {
      const n = name.toLowerCase();
      if (n.includes('ac') || n.includes('air') || n.includes('hvac') || n.includes('heater') || n.includes('cool')) return 'hvac';
      if (n.includes('tv') || n.includes('fridge') || n.includes('oven') || n.includes('microwave') || n.includes('kitchen')) return 'kitchen';
      if (n.includes('washer') || n.includes('dryer') || n.includes('laundry')) return 'laundry';
      if (n.includes('light')) return 'lighting';
      return 'other';
    };

    const catMap = { hvac: 0, kitchen: 0, laundry: 0, lighting: 0, other: 0 };
    Object.entries(deviceMap).forEach(([dev, kwh]) => { catMap[getCategory(dev)] += kwh; });

    // ── If all data is "Unknown/Other", estimate distribution by time-of-day ──
    // This gives meaningful colored slices instead of a plain grey donut
    const allOther = catMap.hvac === 0 && catMap.kitchen === 0 &&
                     catMap.laundry === 0 && catMap.lighting === 0;

    if (allOther && total > 0) {
      // Estimate based on typical household energy split:
      // HVAC ~38%, Kitchen ~24%, Lighting ~14%, Laundry ~13%, Other ~11%
      // But refine using time-of-day from actual records
      const hourTotals = {};
      docs.forEach(d => {
        const h = d.date.getHours();
        hourTotals[h] = (hourTotals[h] || 0) + d.energyConsumed;
      });

      // Morning (6-9): kitchen heavy; Afternoon (12-18): HVAC heavy;
      // Evening (18-22): kitchen+lighting; Night (22-6): baseline
      let hvacKwh = 0, kitchenKwh = 0, laundryKwh = 0, lightingKwh = 0, otherKwh = 0;

      Object.entries(hourTotals).forEach(([h, kwh]) => {
        const hour = parseInt(h);
        if (hour >= 12 && hour < 20) {
          // Peak afternoon/evening — HVAC dominant
          hvacKwh    += kwh * 0.45;
          kitchenKwh += kwh * 0.25;
          lightingKwh += kwh * 0.15;
          laundryKwh += kwh * 0.10;
          otherKwh   += kwh * 0.05;
        } else if (hour >= 6 && hour < 12) {
          // Morning — kitchen dominant
          kitchenKwh += kwh * 0.40;
          hvacKwh    += kwh * 0.25;
          lightingKwh += kwh * 0.15;
          laundryKwh += kwh * 0.15;
          otherKwh   += kwh * 0.05;
        } else if (hour >= 20 && hour < 23) {
          // Evening — lighting + kitchen
          lightingKwh += kwh * 0.30;
          kitchenKwh  += kwh * 0.30;
          hvacKwh     += kwh * 0.25;
          laundryKwh  += kwh * 0.10;
          otherKwh    += kwh * 0.05;
        } else {
          // Night baseline
          hvacKwh    += kwh * 0.35;
          otherKwh   += kwh * 0.35;
          lightingKwh += kwh * 0.15;
          kitchenKwh += kwh * 0.10;
          laundryKwh += kwh * 0.05;
        }
      });

      catMap.hvac     = hvacKwh;
      catMap.kitchen  = kitchenKwh;
      catMap.laundry  = laundryKwh;
      catMap.lighting = lightingKwh;
      catMap.other    = otherKwh;
    }

    const fmt = (kwh) => ({
      kwh:        Math.round(kwh * 100) / 100,
      cost:       Math.round(kwh * TARIFF_INR_PER_KWH * 100) / 100,
      co2_kg:     Math.round(kwh * CO2_KG_PER_KWH * 100) / 100,
      percentage: total ? Math.round(kwh / total * 1000) / 10 : 0
    });

    res.json({
      success:  true,
      hasData:  true,
      hvac:     fmt(catMap.hvac),
      kitchen:  fmt(catMap.kitchen),
      laundry:  fmt(catMap.laundry),
      lighting: fmt(catMap.lighting),
      other:    fmt(catMap.other),
      total:    Math.round(total * 100) / 100,
      estimated: allOther   // flag so frontend can show "estimated" note
    });
  } catch (err) { next(err); }
};

// ── GET /api/analytics/weekly-comparison ─────────────────────────────
const getWeeklyComparison = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const docs   = await EnergyUsage.find({ userId }).sort({ date: -1 });

    if (!docs.length) {
      return res.json({ success: true, hasData: false, this_week: [], last_week: [] });
    }

    // Aggregate by date
    const dateMap = {};
    docs.forEach(d => {
      const key = d.date.toISOString().split('T')[0];
      dateMap[key] = (dateMap[key] || 0) + d.energyConsumed;
    });

    // Sort dates descending, take last 14 unique days
    const sorted = Object.entries(dateMap).sort((a, b) => b[0].localeCompare(a[0]));

    const toEntry = ([date, kwh]) => ({
      date,
      kwh:    Math.round(kwh * 100) / 100,
      cost:   Math.round(kwh * TARIFF_INR_PER_KWH * 100) / 100,
      co2_kg: Math.round(kwh * CO2_KG_PER_KWH * 100) / 100
    });

    // Most recent 7 days = "this week", previous 7 = "last week"
    const thisWeek = sorted.slice(0, 7).reverse().map(toEntry);
    const lastWeek = sorted.slice(7, 14).reverse().map(toEntry);

    res.json({
      success:   true,
      hasData:   true,
      this_week: thisWeek,
      last_week: lastWeek
    });
  } catch (err) { next(err); }
};

// ── GET /api/analytics/hourly ─────────────────────────────────────────
const getHourlyUsage = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    // Default: today. If ?date=YYYY-MM-DD provided, use that date
    const targetDate = req.query.date ? new Date(req.query.date) : null;
    const docs = await EnergyUsage.find({ userId });

    if (!docs.length) {
      return res.json({ success: true, hasData: false, hourly: [] });
    }

    // If a specific date requested, filter to that date only
    const filtered = targetDate
      ? docs.filter(d => d.date.toISOString().split('T')[0] === targetDate.toISOString().split('T')[0])
      : docs;

    const hourlyMap = {};
    for (let i = 0; i < 24; i++) hourlyMap[i] = { total: 0, count: 0 };

    filtered.forEach(d => {
      const hour = d.date.getHours();
      hourlyMap[hour].total += d.energyConsumed;
      hourlyMap[hour].count += 1;
    });

    const hourly = Object.entries(hourlyMap).map(([hour, val]) => ({
      hour:    parseInt(hour),
      avg_kw:  val.count > 0 ? Math.round((val.total / val.count) * 1000) / 1000 : 0,
      total_kwh: Math.round(val.total * 1000) / 1000
    }));

    res.json({ success: true, hasData: true, hourly });
  } catch (err) { next(err); }
};

// ── GET /api/analytics/range?period=day|week|month|year ──────────────
// ── GET /api/analytics/range?period=day|week|month|year ──────────────
// Returns properly aggregated data for each time period button
const getRangeData = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const period = req.query.period || 'week';
    const docs   = await EnergyUsage.find({ userId }).sort({ date: 1 });

    if (!docs.length) {
      return res.json({ success: true, hasData: false, labels: [], prevLabels: [], current: [], previous: [], unit: 'kWh', period });
    }

    // How many unique dates?
    const uniqueDates = [...new Set(docs.map(d => d.date.toISOString().split('T')[0]))].sort();
    const singleDay   = uniqueDates.length <= 1;

    let labels = [], prevLabels = [], current = [], previous = [], unit = 'kWh';

    // ── Helper: build per-record time series for a single day ──────────
    const buildTimeSeries = (dayDocs) => {
      const sorted = [...dayDocs].sort((a, b) => a.date - b.date);
      return {
        labels: sorted.map(d =>
          d.date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
        ),
        data: sorted.map(d => Math.round(d.energyConsumed * 1000) / 1000)
      };
    };

    // ── If all data is on one date, show minute-level ONLY for day period ─
    // For week/month/year, still aggregate properly even with single-day data
    if (singleDay && period === 'day') {
      unit = 'kWh';
      const latestDate  = uniqueDates[0];
      const prevDateObj = new Date(latestDate);
      prevDateObj.setDate(prevDateObj.getDate() - 1);
      const prevDateStr = prevDateObj.toISOString().split('T')[0];

      const todayDocs = docs.filter(d => d.date.toISOString().split('T')[0] === latestDate);
      const prevDocs  = docs.filter(d => d.date.toISOString().split('T')[0] === prevDateStr);

      const today = buildTimeSeries(todayDocs);
      const prev  = buildTimeSeries(prevDocs);

      labels     = today.labels;
      prevLabels = prev.labels.length ? prev.labels : today.labels;
      current    = today.data;
      previous   = prev.data.length
        ? prev.data.concat(Array(Math.max(0, today.data.length - prev.data.length)).fill(null))
        : today.labels.map(() => null);

      return res.json({ success: true, hasData: true, labels, prevLabels, current, previous, unit, period, singleDay: true });
    }

    // ── Multi-day data: aggregate per period ───────────────────────────
    // If data spans multiple months AND user clicked Month/Year, show monthly view
    const firstDate = new Date(uniqueDates[0]);
    const lastDate  = new Date(uniqueDates[uniqueDates.length - 1]);
    const monthSpan = (lastDate.getFullYear() - firstDate.getFullYear()) * 12 +
                      (lastDate.getMonth() - firstDate.getMonth());
    const useMonthly = monthSpan >= 2 && period === 'year';

    if (useMonthly) {
      // ── Monthly aggregation ───────────────────────────────────────
      unit = 'kWh';
      const monthMap = {};
      docs.forEach(d => {
        const key = d.date.getFullYear() + '-' + String(d.date.getMonth() + 1).padStart(2, '0');
        monthMap[key] = (monthMap[key] || 0) + d.energyConsumed;
      });
      const allMonths = Object.keys(monthMap).sort();
      const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

      labels     = allMonths.map(m => {
        const [yr, mo] = m.split('-');
        return MONTH_NAMES[parseInt(mo) - 1] + ' ' + yr.slice(2);
      });
      prevLabels = labels;
      current    = allMonths.map(m => Math.round((monthMap[m] || 0) * 100) / 100);
      previous   = allMonths.map(() => null);

      return res.json({ success: true, hasData: true, labels, prevLabels, current, previous, unit, period: 'month', singleDay: false, monthlyView: true });
    }

    if (period === 'day') {
      unit = 'kWh';
      const latestDate  = uniqueDates[uniqueDates.length - 1];
      const prevDateObj = new Date(latestDate);
      prevDateObj.setDate(prevDateObj.getDate() - 1);
      const prevDateStr = prevDateObj.toISOString().split('T')[0];

      const todayDocs = docs.filter(d => d.date.toISOString().split('T')[0] === latestDate);
      const prevDocs  = docs.filter(d => d.date.toISOString().split('T')[0] === prevDateStr);

      const today = buildTimeSeries(todayDocs);
      const prev  = buildTimeSeries(prevDocs);

      labels     = today.labels;
      prevLabels = prev.labels.length ? prev.labels : today.labels;
      current    = today.data;
      previous   = prev.data.length
        ? prev.data.concat(Array(Math.max(0, today.data.length - prev.data.length)).fill(null))
        : today.labels.map(() => null);

    } else if (period === 'week') {
      unit = 'kWh';
      const dateMap = {};
      docs.forEach(d => {
        const key = d.date.toISOString().split('T')[0];
        dateMap[key] = (dateMap[key] || 0) + d.energyConsumed;
      });
      const last7 = uniqueDates.slice(-7);
      const prev7 = uniqueDates.slice(-14, -7);

      labels     = last7.map(d => new Date(d).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' }));
      prevLabels = prev7.length
        ? prev7.map(d => new Date(d).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' }))
        : last7.map((_, i) => 'Prev Day ' + (i + 1));
      current  = last7.map(d => Math.round((dateMap[d] || 0) * 100) / 100);
      previous = prev7.length
        ? prev7.map(d => Math.round((dateMap[d] || 0) * 100) / 100)
        : last7.map(() => null);

    } else if (period === 'month') {
      unit = 'kWh';
      const dateMap = {};
      docs.forEach(d => {
        const key = d.date.toISOString().split('T')[0];
        dateMap[key] = (dateMap[key] || 0) + d.energyConsumed;
      });
      const last30 = uniqueDates.slice(-30);
      const prev30 = uniqueDates.slice(-60, -30);

      labels     = last30.map(d => new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }));
      prevLabels = prev30.length
        ? prev30.map(d => new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }))
        : last30.map((_, i) => 'Prev Day ' + (i + 1));
      current  = last30.map(d => Math.round((dateMap[d] || 0) * 100) / 100);
      previous = prev30.length
        ? prev30.map(d => Math.round((dateMap[d] || 0) * 100) / 100)
        : last30.map(() => null);

    } else if (period === 'year') {
      unit = 'kWh';
      const monthMap = {};
      docs.forEach(d => {
        const key = d.date.getFullYear() + '-' + String(d.date.getMonth() + 1).padStart(2, '0');
        monthMap[key] = (monthMap[key] || 0) + d.energyConsumed;
      });
      const currentYear = new Date().getFullYear();
      const prevYear    = currentYear - 1;
      const months12    = Array.from({ length: 12 }, (_, i) => currentYear + '-' + String(i + 1).padStart(2, '0'));
      const prevMonths  = Array.from({ length: 12 }, (_, i) => prevYear    + '-' + String(i + 1).padStart(2, '0'));

      labels     = months12.map(m => new Date(m + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
      prevLabels = prevMonths.map(m => new Date(m + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
      current    = months12.map(m => Math.round((monthMap[m] || 0) * 100) / 100);
      previous   = prevMonths.map(m => Math.round((monthMap[m] || 0) * 100) / 100);
    }

    res.json({ success: true, hasData: true, labels, prevLabels, current, previous, unit, period, singleDay: false });
  } catch (err) { next(err); }
};

module.exports = {
  getSummary, getTrends, getPeakHours,
  getSubmeteringBreakdown, getWeeklyComparison, getHourlyUsage, getRangeData
};
