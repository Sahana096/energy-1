const EnergyUsage = require('../models/EnergyUsage');
const { CO2_KG_PER_KWH, TARIFF_INR_PER_KWH } = require('../config/constants');

const getRecommendations = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const docs   = await EnergyUsage.find({ userId }).sort({ date: -1 });

    if (!docs.length) {
      return res.json({ success: true, hasData: false, recommendations: [] });
    }

    const totalKwh  = docs.reduce((s, d) => s + d.energyConsumed, 0);
    const avgDaily  = totalKwh / docs.length;
    const recent7   = docs.slice(0, 7);
    const recentAvg = recent7.reduce((s, d) => s + d.energyConsumed, 0) / (recent7.length || 1);

    const deviceMap = {};
    docs.forEach(d => {
      const dev = d.device || 'Unknown';
      deviceMap[dev] = (deviceMap[dev] || 0) + d.energyConsumed;
    });
    const topDevice = Object.entries(deviceMap).sort((a, b) => b[1] - a[1])[0];

    const recommendations = [];

    if (recentAvg > avgDaily * 1.1) {
      const extraKwh     = recentAvg - avgDaily;
      const savingsKwh   = +(extraKwh * 7).toFixed(2);
      const savingsCost  = +(savingsKwh * TARIFF_INR_PER_KWH).toFixed(2);
      const savingsCo2   = +(savingsKwh * CO2_KG_PER_KWH).toFixed(2);
      recommendations.push({
        id:                   1,
        title:                'Recent Usage Spike Detected',
        description:          `Your last 7-day average (${recentAvg.toFixed(2)} kWh) is ${((recentAvg / avgDaily - 1) * 100).toFixed(0)}% above your overall average (${avgDaily.toFixed(2)} kWh). Review device usage to reduce costs.`,
        priority:             'high',
        icon:                 'exclamation-triangle',
        potential_savings_kwh:  savingsKwh,
        potential_savings_inr:  savingsCost,
        potential_savings_co2:  savingsCo2
      });
    }

    if (topDevice) {
      const savingsKwh  = +(topDevice[1] * 0.15).toFixed(2);
      const savingsCost = +(savingsKwh * TARIFF_INR_PER_KWH).toFixed(2);
      const savingsCo2  = +(savingsKwh * CO2_KG_PER_KWH).toFixed(2);
      recommendations.push({
        id:                   2,
        title:                `Optimise ${topDevice[0]} Usage`,
        description:          `${topDevice[0]} is your highest-consuming device at ${topDevice[1].toFixed(2)} kWh total. Using timers or smart plugs could cut its consumption by ~15%.`,
        priority:             'medium',
        icon:                 'plug',
        potential_savings_kwh:  savingsKwh,
        potential_savings_inr:  savingsCost,
        potential_savings_co2:  savingsCo2
      });
    }

    // Off-peak shifting recommendation
    const offPeakSavingsKwh  = +(avgDaily * 0.08 * 7).toFixed(2);
    recommendations.push({
      id:                   3,
      title:                'Shift to Off-Peak Hours',
      description:          'Running high-load appliances (washing machine, dishwasher) between 11 PM – 6 AM can reduce your bill by up to 30% on time-of-use tariffs.',
      priority:             'medium',
      icon:                 'clock',
      potential_savings_kwh:  offPeakSavingsKwh,
      potential_savings_inr:  +(offPeakSavingsKwh * TARIFF_INR_PER_KWH).toFixed(2),
      potential_savings_co2:  +(offPeakSavingsKwh * CO2_KG_PER_KWH).toFixed(2)
    });

    recommendations.push({
      id:                   4,
      title:                'Upload More Data for Better Insights',
      description:          `You have ${docs.length} records. More historical data improves prediction accuracy and personalises recommendations.`,
      priority:             'low',
      icon:                 'chart-line',
      potential_savings_kwh:  null,
      potential_savings_inr:  null,
      potential_savings_co2:  null
    });

    res.json({ success: true, hasData: true, recommendations });
  } catch (err) { next(err); }
};

module.exports = { getRecommendations };
