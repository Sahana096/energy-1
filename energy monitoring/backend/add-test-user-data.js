const mongoose = require('mongoose');
const User = require('./models/User');
const EnergyUsage = require('./models/EnergyUsage');

const addTestDataForUser = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/energy_monitoring');
    console.log('Connected to MongoDB\n');
    
    const testUser = await User.findOne({ email: 'testuser@example.com' });
    console.log('Test User ID:', testUser._id.toString());
    
    // Add energy data for this user (last 14 days)
    const devices = ['Air Conditioner', 'TV', 'Refrigerator', 'Washing Machine', 'Lights'];
    const now = new Date();
    const records = [];
    
    for (let daysAgo = 0; daysAgo < 14; daysAgo++) {
      const date = new Date(now);
      date.setDate(date.getDate() - daysAgo);
      
      // Add 2-3 readings per day
      const readingsPerDay = 2 + Math.floor(Math.random() * 2);
      
      for (let r = 0; r < readingsPerDay; r++) {
        const hour = 8 + Math.floor(Math.random() * 14);
        const minute = Math.floor(Math.random() * 60);
        
        const recordDate = new Date(date);
        recordDate.setHours(hour, minute, 0, 0);
        
        const device = devices[Math.floor(Math.random() * devices.length)];
        const energyConsumed = 1.5 + Math.random() * 10;
        
        records.push({
          userId: testUser._id,
          date: recordDate,
          energyConsumed: Math.round(energyConsumed * 100) / 100,
          device: device
        });
      }
    }
    
    await EnergyUsage.insertMany(records);
    console.log(`\n✅ Added ${records.length} energy records for test user\n`);
    
    // Verify
    const count = await EnergyUsage.countDocuments({ userId: testUser._id });
    console.log(`Total records for test user: ${count}`);
    
    const allData = await EnergyUsage.find({ userId: testUser._id });
    const totalKwh = allData.reduce((sum, d) => sum + d.energyConsumed, 0);
    console.log(`Total energy: ${totalKwh.toFixed(2)} kWh`);
    
    await mongoose.disconnect();
    console.log('\nDone!');
  } catch (error) {
    console.error('Error:', error.message);
  }
};

addTestDataForUser();
