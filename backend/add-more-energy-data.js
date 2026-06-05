const mongoose = require('mongoose');
const EnergyUsage = require('./models/EnergyUsage');
const User = require('./models/User');

const addMoreEnergyData = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/energy_monitoring');
    console.log('Connected to MongoDB\n');
    
    const adminUser = await User.findOne({ email: 'admin@energyai.com' });
    
    // Get existing count
    const existingCount = await EnergyUsage.countDocuments({ userId: adminUser._id });
    console.log(`Existing records: ${existingCount}\n`);
    
    // Add more records to fill both weeks completely
    const devices = ['Air Conditioner', 'Smart TV', 'Refrigerator', 'Water Heater', 'LED Lights', 'Laptop', 'Washing Machine', 'Microwave', 'Desktop Computer'];
    
    const now = new Date();
    const newRecords = [];
    
    // Add data for the last 14 days (this week + last week)
    for (let daysAgo = 0; daysAgo < 14; daysAgo++) {
      const date = new Date(now);
      date.setDate(date.getDate() - daysAgo);
      
      // Add 2-3 readings per day
      const readingsPerDay = 2 + Math.floor(Math.random() * 2);
      
      for (let r = 0; r < readingsPerDay; r++) {
        const hour = 8 + Math.floor(Math.random() * 14); // Between 8 AM and 10 PM
        const minute = Math.floor(Math.random() * 60);
        
        const recordDate = new Date(date);
        recordDate.setHours(hour, minute, 0, 0);
        
        const device = devices[Math.floor(Math.random() * devices.length)];
        const energyConsumed = 1.5 + Math.random() * 12; // 1.5 to 13.5 kWh
        
        newRecords.push({
          userId: adminUser._id,
          date: recordDate,
          energyConsumed: Math.round(energyConsumed * 100) / 100,
          device: device,
          activePower: Math.round((energyConsumed * 1000) * 100) / 100
        });
      }
    }
    
    await EnergyUsage.insertMany(newRecords);
    console.log(`✅ Added ${newRecords.length} new energy records\n`);
    
    // Verify totals
    const totalRecords = await EnergyUsage.countDocuments({ userId: adminUser._id });
    console.log(`Total records: ${totalRecords}`);
    
    const allData = await EnergyUsage.find({ userId: adminUser._id }).sort({ date: 1 });
    const totalKwh = allData.reduce((sum, d) => sum + d.energyConsumed, 0);
    const co2 = totalKwh * 0.233;
    
    console.log(`Total Energy: ${totalKwh.toFixed(2)} kWh`);
    console.log(`Total CO2: ${co2.toFixed(2)} kg`);
    
    // Show date distribution
    const dateMap = {};
    allData.forEach(d => {
      const key = d.date.toISOString().split('T')[0];
      if (!dateMap[key]) dateMap[key] = 0;
      dateMap[key] += d.energyConsumed;
    });
    
    console.log('\nDaily breakdown:');
    Object.entries(dateMap).sort((a, b) => a[0].localeCompare(b[0])).forEach(([date, kwh]) => {
      console.log(`  ${date}: ${kwh.toFixed(2)} kWh`);
    });
    
    await mongoose.disconnect();
    console.log('\nDone!');
  } catch (error) {
    console.error('Error:', error.message);
  }
};

addMoreEnergyData();
