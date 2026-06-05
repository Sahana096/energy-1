const mongoose = require('mongoose');
const User = require('./models/User');
const EnergyUsage = require('./models/EnergyUsage');
require('dotenv').config();
const jwt = require('jsonwebtoken');

const testAPI = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/energy_monitoring');
    console.log('Connected to MongoDB\n');
    
    const user = await User.findOne({ email: 'admin@energyai.com' });
    console.log('Admin User ID:', user._id.toString());
    
    // Create JWT token
    const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    console.log('\nToken created successfully\n');
    
    // Test the summary endpoint using built-in fetch
    const res = await fetch('http://localhost:5000/api/energy/summary', {
      headers: {
        'Authorization': 'Bearer ' + token
      }
    });
    
    const data = await res.json();
    console.log('API Response:');
    console.log(JSON.stringify(data, null, 2));
    
    await mongoose.disconnect();
    console.log('\nDone!');
  } catch (error) {
    console.error('Error:', error.message);
  }
};

testAPI();
