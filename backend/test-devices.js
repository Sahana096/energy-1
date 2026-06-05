const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Device = require('./models/Device');
const User = require('./models/User');

const testDevices = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/energy_monitoring');
    console.log('Connected to MongoDB\n');
    
    // Get admin user
    const adminUser = await User.findOne({ email: 'admin@energyai.com' });
    console.log('Admin User ID:', adminUser._id.toString());
    
    // Generate a valid token
    const JWT_SECRET = process.env.JWT_SECRET || 'energyai_super_secret_key_2024';
    const token = jwt.sign(
      { userId: adminUser._id, email: adminUser.email, role: adminUser.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    console.log('\nValid JWT Token:', token);
    console.log('\nUse this token in the browser console to test:');
    console.log(`sessionStorage.setItem('energyai_token', '${token}')`);
    
    // Check existing devices
    const deviceCount = await Device.countDocuments({ userId: adminUser._id });
    console.log(`\nCurrent devices for admin: ${deviceCount}`);
    
    if (deviceCount === 0) {
      console.log('\nNo devices found. They will be auto-created when you visit the Devices page.');
      console.log('The seedDefaultDevices() function in deviceController.js will create 9 default devices.');
    } else {
      const devices = await Device.find({ userId: adminUser._id });
      console.log('\nExisting devices:');
      devices.forEach((d, i) => {
        console.log(`${i+1}. ${d.name} - ${d.location} (${d.power_kw} kW)`);
      });
    }
    
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error.message);
  }
};

testDevices();
