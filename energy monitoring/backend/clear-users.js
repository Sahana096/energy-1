const mongoose = require('mongoose');
const User = require('./models/User');

const clearDuplicateUsers = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/energy_monitoring');
    console.log('Connected to MongoDB');

    // Find and remove duplicate users, keeping only one
    const users = await User.find({});
    console.log(`Found ${users.length} users in database`);
    
    // Show all users
    users.forEach((user, index) => {
      console.log(`${index + 1}. Email: ${user.email}, Name: ${user.name}, Role: ${user.role}`);
    });

    // Remove the admin user so you can create a fresh one
    const result = await User.deleteMany({ email: 'admin@energyai.com' });
    console.log(`\nDeleted ${result.deletedCount} admin user(s)`);
    
    // Also remove the user's email if it exists
    const userResult = await User.deleteMany({ email: 'reenaadluri@gmail.com' });
    console.log(`Deleted ${userResult.deletedCount} user(s) with reenaadluri@gmail.com`);

    console.log('\nDatabase cleaned! You can now register/login with fresh credentials.');
    
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error.message);
  }
};

clearDuplicateUsers();
