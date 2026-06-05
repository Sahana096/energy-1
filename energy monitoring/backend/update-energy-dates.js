const mongoose = require('mongoose');
const EnergyUsage = require('./models/EnergyUsage');
const User = require('./models/User');

const updateEnergyDates = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/energy_monitoring');
    console.log('Connected to MongoDB\n');
    
    const adminUser = await User.findOne({ email: 'admin@energyai.com' });
    
    // Get all energy records
    const docs = await EnergyUsage.find({ userId: adminUser._id }).sort({ date: 1 });
    console.log(`Found ${docs.length} energy records\n`);
    
    // Update dates to be from this week and last week
    const now = new Date();
    const updates = [];
    
    docs.forEach((doc, index) => {
      // Distribute across last 14 days (this week and last week)
      const daysAgo = index % 14;
      const newDate = new Date(now);
      newDate.setDate(newDate.getDate() - daysAgo);
      newDate.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60), 0, 0);
      
      updates.push({
        filter: { _id: doc._id },
        update: { $set: { date: newDate } }
      });
    });
    
    // Apply all updates
    for (const update of updates) {
      await EnergyUsage.updateOne(update.filter, update.update);
    }
    
    console.log('✅ Updated all energy record dates to recent dates\n');
    
    // Verify
    const updated = await EnergyUsage.find({ userId: adminUser._id }).sort({ date: 1 });
    console.log('Updated date range:');
    console.log('First:', updated[0].date.toLocaleString());
    console.log('Last:', updated[updated.length - 1].date.toLocaleString());
    console.log('\nSample records:');
    updated.slice(0, 5).forEach(d => {
      console.log(`${d.date.toLocaleDateString()} - ${d.energyConsumed} kWh - ${d.device}`);
    });
    
    const totalKwh = updated.reduce((sum, d) => sum + d.energyConsumed, 0);
    const co2 = totalKwh * 0.233;
    console.log(`\nTotal Energy: ${totalKwh.toFixed(2)} kWh`);
    console.log(`Total CO2: ${co2.toFixed(2)} kg`);
    
    await mongoose.disconnect();
    console.log('\nDone!');
  } catch (error) {
    console.error('Error:', error.message);
  }
};

updateEnergyDates();
