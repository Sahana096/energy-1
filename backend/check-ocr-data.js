const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/energy_monitoring').then(async () => {
  const EnergyUsage = require('./models/EnergyUsage');
  const docs = await EnergyUsage.find({
    device: { $in: ['Bill History (OCR)', 'Bill Image (OCR)'] }
  }).sort({ date: 1 });
  console.log('Bill OCR records:', docs.length);
  docs.forEach(d => console.log(
    d.date.toISOString().split('T')[0],
    d.energyConsumed + ' kWh',
    '|', d.device,
    '| user:', String(d.userId)
  ));
  mongoose.disconnect();
});
