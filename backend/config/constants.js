/**
 * Shared application constants.
 * Import from here — never hardcode these values in controllers.
 */

// CO₂ emission factor: kg of CO₂ per kWh of electricity consumed.
// Source: India Central Electricity Authority (CEA) 2023 — 0.82 kg CO₂/kWh
// Change this one value to update all carbon calculations across the app.
const CO2_KG_PER_KWH = 0.82;

// A mature tree absorbs ~21 kg CO₂/year
const CO2_KG_PER_TREE_PER_YEAR = 21;

// India national average household daily electricity consumption (kWh/day)
const NATIONAL_AVG_DAILY_KWH = 28.9;

// Electricity tariff used for cost estimates (₹ per kWh)
const TARIFF_INR_PER_KWH = 7;

module.exports = {
  CO2_KG_PER_KWH,
  CO2_KG_PER_TREE_PER_YEAR,
  NATIONAL_AVG_DAILY_KWH,
  TARIFF_INR_PER_KWH
};
