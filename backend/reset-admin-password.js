const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

const resetPassword = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/energy_monitoring');
    console.log('Connected to MongoDB\n');
    
    const adminUser = await User.findOne({ email: 'admin@energyai.com' });
    
    if (!adminUser) {
      console.log('Admin user not found!');
      await mongoose.disconnect();
      return;
    }
    
    // Reset password to admin123
    const newPassword = 'admin123';
    adminUser.password = await bcrypt.hash(newPassword, 10);
    await adminUser.save();
    
    console.log('✅ Admin password reset successfully!');
    console.log('Email: admin@energyai.com');
    console.log('Password: admin123');
    console.log('\nThis user now has 10 energy data records.');
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
  }
};

resetPassword();
