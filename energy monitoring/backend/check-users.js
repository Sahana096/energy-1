const mongoose = require('mongoose');
const User = require('./models/User');

const checkUsers = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/energy_monitoring');
    console.log('Connected to MongoDB\n');
    
    const users = await User.find({});
    console.log('Users in database:');
    console.log('==================\n');
    
    users.forEach((u, i) => {
      console.log(`${i+1}. User ID: ${u._id}`);
      console.log(`   Email: ${u.email}`);
      console.log(`   Name: ${u.name}`);
      console.log(`   Role: ${u.role}`);
      console.log('');
    });
    
    console.log(`Total users: ${users.length}`);
    
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error.message);
  }
};

checkUsers();
