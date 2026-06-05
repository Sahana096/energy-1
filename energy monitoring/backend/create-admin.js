const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

const createAdminUser = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/energy_monitoring');
    console.log('Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin@energyai.com' });
    
    if (existingAdmin) {
      console.log('\n✅ Admin user already exists!');
      console.log('Email: admin@energyai.com');
      console.log('Password: admin123');
      console.log('Role:', existingAdmin.role);
    } else {
      // Create admin user
      const hashedPassword = await bcrypt.hash('admin123', 10);
      const admin = await User.create({
        email: 'admin@energyai.com',
        password: hashedPassword,
        name: 'Admin',
        role: 'admin'
      });
      
      console.log('\n✅ Admin user created successfully!');
      console.log('Email: admin@energyai.com');
      console.log('Password: admin123');
      console.log('Role:', admin.role);
    }

    // Show all users
    const users = await User.find({});
    console.log('\n📋 All users in system:');
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name} (${user.email}) - Role: ${user.role}`);
    });
    
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error.message);
  }
};

createAdminUser();
