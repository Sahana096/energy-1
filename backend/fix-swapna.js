const mongoose = require('mongoose');
const EnergyUsage = require('./models/EnergyUsage');
const User = require('./models/User');

mongoose.connect('mongodb://localhost:27017/energy_monitoring').then(async () => {
  // Find swapna's user
  const u = await User.findOne({ name: /swapna/i });
  if (!u) { console.log('User not found'); process.exit(); }
  console.log('User:', u.email, u._id);

  const docs = await EnergyUsage.find({
    userId: u._id,
    device: { $in: ['Bill History (OCR)', 'Bill Image (OCR)'] }
  }).sort({ date: 1 });

  console.log('Bill records:', docs.length);
  docs.forEach(d => console.log(d._id, d.date.toISOString().split('T')[0], d.energyConsumed, d.device));

  // Find and remove duplicates (same month, both Bill Image and Bill History)
  const monthMap = {};
  const toDelete = [];
  for (const d of docs) {
    const key = d.date.getFullYear() + '-' + String(d.date.getMonth() + 1).padStart(2, '0');
    if (monthMap[key]) {
      // Keep Bill History, delete Bill Image duplicate
      if (d.device === 'Bill Image (OCR)') {
        toDelete.push(d._id);
        console.log('Will delete duplicate:', d._id, key, d.device);
      } else {
        toDelete.push(monthMap[key]._id);
        console.log('Will delete duplicate:', monthMap[key]._id, key, monthMap[key].device);
        monthMap[key] = d;
      }
    } else {
      monthMap[key] = d;
    }
  }

  if (toDelete.length > 0) {
    await EnergyUsage.deleteMany({ _id: { $in: toDelete } });
    console.log('Deleted', toDelete.length, 'duplicates');
  } else {
    console.log('No duplicates found');
  }

  // Show final state
  const final = await EnergyUsage.find({
    userId: u._id,
    device: { $in: ['Bill History (OCR)', 'Bill Image (OCR)'] }
  }).sort({ date: 1 });
  console.log('\nFinal bill records:', final.length);
  final.forEach(d => console.log(d.date.toISOString().split('T')[0], d.energyConsumed, d.device));

  mongoose.disconnect();
});
