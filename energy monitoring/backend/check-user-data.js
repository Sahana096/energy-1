const mongoose = require('mongoose');
const EnergyUsage = require('./models/EnergyUsage');

const checkUserData = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/energy_monitoring');
    console.log('Connected to MongoDB\n');
    
    const counts = await EnergyUsage.aggregate([
      { $group: { _id: '$userId', count: { $sum: 1 } } },
      { $project: { count: 1 } }
    ]);
    
    console.log('Users with energy data:');
    for (const c of counts) {
      console.log('User:', c._id.toString(), '- Records:', c.count);
    }
    
    await mongoose.disconnect();
    console.log('\nDone!');
  } catch (error) {
    console.error('Error:', error.message);
  }
};

checkUserData();
