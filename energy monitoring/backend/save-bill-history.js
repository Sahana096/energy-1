// Run this once to save the 7-month history from the TSSPDCL bill
const mongoose = require('mongoose');
const EnergyUsage = require('./models/EnergyUsage');

mongoose.connect('mongodb://localhost:27017/energy_monitoring').then(async () => {
  const userId = '69fc2522cac5162ce5151fe3'; // user who uploaded TSSPDCL bill

  const history = [
    { period: 'OCT-23', units: 287 },
    { period: 'NOV-23', units: 298 },
    { period: 'DEC-23', units: 310 },
    { period: 'JAN-24', units: 320 },
    { period: 'FEB-24', units: 315 },
    { period: 'MAR-24', units: 0   }, // not visible in bill, skip
    { period: 'APR-24', units: 333 },
  ].filter(h => h.units > 0);

  const MONTH_MAP = {OCT:10,NOV:11,DEC:12,JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9};

  let saved = 0;
  for (const h of history) {
    const [mon, yr2] = h.period.split('-');
    const yr = parseInt(yr2) < 100 ? 2000 + parseInt(yr2) : parseInt(yr2);
    const monNum = MONTH_MAP[mon];
    if (!monNum) continue;
    const date = new Date(yr, monNum - 1, 15);

    const exists = await EnergyUsage.findOne({
      userId,
      date: { $gte: new Date(yr, monNum - 1, 1), $lt: new Date(yr, monNum, 1) },
      device: 'Bill History (OCR)'
    });

    if (!exists) {
      await EnergyUsage.create({ userId, date, energyConsumed: h.units, device: 'Bill History (OCR)' });
      console.log('Saved:', h.period, h.units, 'kWh');
      saved++;
    } else {
      console.log('Already exists:', h.period);
    }
  }
  console.log('Total saved:', saved);
  mongoose.disconnect();
});
