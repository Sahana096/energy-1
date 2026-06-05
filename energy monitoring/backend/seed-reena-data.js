// Seeds 67 days of sample data for reenaadluri@gmail.com
const mongoose = require('mongoose');
const EnergyUsage = require('./models/EnergyUsage');
const User = require('./models/User');

mongoose.connect('mongodb://localhost:27017/energy_monitoring').then(async () => {
  const user = await User.findOne({ email: 'reenaadluri@gmail.com' });
  if (!user) { console.log('User not found'); process.exit(1); }

  // Generate 67 days of data: Mar 1 – May 7, 2025
  const records = [];
  const devices = ['AC', 'Kitchen', 'Lighting'];
  const hours = [6, 9, 12, 18, 21];
  const baseValues = { 6: 2.1, 9: 1.8, 12: 2.5, 18: 3.1, 21: 1.5 };

  const start = new Date('2025-03-01');
  for (let day = 0; day < 67; day++) {
    const date = new Date(start);
    date.setDate(start.getDate() + day);
    const dateStr = date.toISOString().split('T')[0];

    for (let h = 0; h < hours.length; h++) {
      const hour = hours[h];
      const base = baseValues[hour];
      const variation = (Math.random() - 0.5) * 0.8;
      const kwh = Math.max(0.5, +(base + variation).toFixed(3));
      const device = devices[h % devices.length];

      records.push({
        userId: user._id,
        date: new Date(`${dateStr}T${String(hour).padStart(2,'0')}:00:00`),
        energyConsumed: kwh,
        device
      });
    }
  }

  // Remove old single-day data first
  await EnergyUsage.deleteMany({ userId: user._id, date: { $lt: new Date('2025-01-01') } });
  
  await EnergyUsage.insertMany(records);
  console.log(`Inserted ${records.length} records for reenaadluri@gmail.com`);
  console.log('Date range: 2025-03-01 to 2025-05-07');
  mongoose.disconnect();
});
