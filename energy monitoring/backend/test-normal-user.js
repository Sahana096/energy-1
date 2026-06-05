const mongoose = require('mongoose');
const User = require('./models/User');
const EnergyUsage = require('./models/EnergyUsage');
require('dotenv').config();
const jwt = require('jsonwebtoken');

const testNormalUser = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/energy_monitoring');
    console.log('Connected to MongoDB\n');
    
    // Find or create a test user
    let testUser = await User.findOne({ email: 'testuser@example.com' });
    
    if (!testUser) {
      console.log('Creating test user...');
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('test123', 10);
      testUser = await User.create({
        name: 'Test User',
        email: 'testuser@example.com',
        password: hashedPassword,
        role: 'user'
      });
      console.log('✅ Created test user\n');
    } else {
      console.log('Test user exists:', testUser._id.toString(), '\n');
    }
    
    // Check if this user has energy data
    const energyCount = await EnergyUsage.countDocuments({ userId: testUser._id });
    console.log(`Test user energy records: ${energyCount}\n`);
    
    // Create JWT token for this user
    const token = jwt.sign({ userId: testUser._id, role: testUser.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    
    // Test the summary endpoint
    const res = await fetch('http://localhost:5000/api/energy/summary', {
      headers: {
        'Authorization': 'Bearer ' + token
      }
    });
    
    const data = await res.json();
    console.log('API Response for normal user:');
    console.log(JSON.stringify(data, null, 2));
    
    await mongoose.disconnect();
    console.log('\nDone!');
  } catch (error) {
    console.error('Error:', error.message);
  }
};

testNormalUser();
