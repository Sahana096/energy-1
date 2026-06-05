const mongoose = require('mongoose');

const fixDevicesCollection = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/energy_monitoring');
    console.log('Connected to MongoDB\n');
    
    // Drop the entire devices collection
    await mongoose.connection.db.dropCollection('devices');
    console.log('✅ Dropped devices collection');
    
    // Recreate with proper schema
    const Device = require('./models/Device');
    const User = require('./models/User');
    
    const adminUser = await User.findOne({ email: 'admin@energyai.com' });
    console.log('Admin User:', adminUser._id.toString());
    
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
    console.log('\n✅ Created 9 devices for admin');
    
    const count = await Device.countDocuments();
    console.log(`Total devices: ${count}`);
    
    await mongoose.disconnect();
    console.log('\nDone!');
  } catch (error) {
    console.error('Error:', error.message);
  }
};

fixDevicesCollection();
