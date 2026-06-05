const mongoose = require('mongoose');
const EnergyUsage = require('./models/EnergyUsage');
const User = require('./models/User');

mongoose.connect('mongodb://localhost:27017/energy_monitoring').then(async () => {
  const u = await User.findOne({ email: 'reenaadluri@gmail.com' });
  // Remove old 2026 data (the single-day Apr 1 2026 records)
  const result = await EnergyUsage.deleteMany({
    userId: u._id,
    date: { $gte: new Date('2026-01-01') }
  });
  console.log('Deleted old 2026 records:', result.deletedCount);
  const remaining = await EnergyUsage.countDocuments({ userId: u._id });
  const dates = await EnergyUsage.distinct('date', { userId: u._id });
  const dateStrs = [...new Set(dates.map(d => d.toISOString().split('T')[0]))].sort();
  console.log('Remaining records:', remaining);
  console.log('Date range:', dateStrs[0], 'to', dateStrs[dateStrs.length-1]);
  mongoose.disconnect();
});
