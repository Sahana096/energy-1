const mongoose = require('mongoose');
const Device = require('./models/Device');
const User = require('./models/User');

const seedAdminDevices = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/energy_monitoring');
    console.log('Connected to MongoDB\n');
    
    const adminUser = await User.findOne({ email: 'admin@energyai.com' });
    console.log('Admin User ID:', adminUser._id.toString());
    
    // Check if devices already exist
    const existingCount = await Device.countDocuments({ userId: adminUser._id });
    
    if (existingCount > 0) {
      console.log(`\n✅ Admin already has ${existingCount} devices`);
      await mongoose.disconnect();
      return;
    }
    
    // Create default devices for admin
    const defaultDevices = [
      { userId: adminUser._id, name: 'Air Conditioner', location: 'Living Room', icon: 'snowflake', power_kw: 1.2, status: true, energy_kwh: 45.5 },
      { userId: adminUser._id, name: 'Smart TV', location: 'Bedroom', icon: 'tv', power_kw: 0.15, status: true, energy_kwh: 12.3 },
      { userId: adminUser._id, name: 'Refrigerator', location: 'Kitchen', icon: 'blender', power_kw: 0.18, status: true, energy_kwh: 35.8 },
      { userId: adminUser._id, name: 'Water Heater', location: 'Bathroom', icon: 'fire', power_kw: 0.95, status: false, energy_kwh: 28.4 },
      { userId: adminUser._id, name: 'LED Lights', location: 'Kitchen', icon: 'lightbulb', power_kw: 0.08, status: true, energy_kwh: 8.2 },
      { userId: adminUser._id, name: 'Laptop', location: 'Home Office', icon: 'laptop', power_kw: 0.06, status: true, energy_kwh: 15.6 },
      { userId: adminUser._id, name: 'Washing Machine', location: 'Laundry Room', icon: 'tint', power_kw: 0.5, status: false, energy_kwh: 22.1 },
      { userId: adminUser._id, name: 'Microwave', location: 'Kitchen', icon: 'radiation', power_kw: 1.0, status: false, energy_kwh: 18.9 },
      { userId: adminUser._id, name: 'Desktop Computer', location: 'Office', icon: 'desktop', power_kw: 0.3, status: true, energy_kwh: 20.4 }
    ];
    
    await Device.insertMany(defaultDevices);
    console.log('\n✅ Created 9 default devices for admin user');
    
    // Verify
    const count = await Device.countDocuments({ userId: adminUser._id });
    console.log(`Total devices for admin: ${count}`);
    
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error.message);
  }
};

seedAdminDevices();
