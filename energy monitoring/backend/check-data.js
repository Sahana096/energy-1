const mongoose = require('mongoose');
const EnergyUsage = require('./models/EnergyUsage');
const User = require('./models/User');

const transferData = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/energy_monitoring');
    console.log('Connected to MongoDB\n');
    
    // Get admin user
    const adminUser = await User.findOne({ email: 'admin@energyai.com' });
    const testUser = await User.findOne({ email: 'testuser@example.com' });
    
    console.log('Admin User:', adminUser._id.toString());
    console.log('Test User:', testUser._id.toString());
    
    // Get all energy data from testuser
    const testUserData = await EnergyUsage.find({ userId: testUser._id });
    console.log(`\nFound ${testUserData.length} records for testuser`);
    
    // Update all records to belong to admin
    const result = await EnergyUsage.updateMany(
      { userId: testUser._id },
      { $set: { userId: adminUser._id } }
    );
    
    console.log(`\n✅ Transferred ${result.modifiedCount} records to admin user`);
    
    // Verify
    const adminCount = await EnergyUsage.countDocuments({ userId: adminUser._id });
    const testCount = await EnergyUsage.countDocuments({ userId: testUser._id });
    
    console.log(`\nVerification:`);
    console.log(`Admin user records: ${adminCount}`);
    console.log(`Test user records: ${testCount}`);
    
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error.message);
  }
};

transferData();
