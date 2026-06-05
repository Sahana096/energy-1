/**
 * Run: node backend/create-user.js
 * Creates a regular user account in MongoDB.
 * Edit the email/password/name below before running.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

const USER_EMAIL    = 'your_email@gmail.com';  // ← change this
const USER_PASSWORD = 'yourpassword';           // ← change this
const USER_NAME     = 'Your Name';              // ← change this

async function createUser() {
    await mongoose.connect('mongodb://localhost:27017/energy_monitoring');
    console.log('Connected to MongoDB');

    const existing = await User.findOne({ email: USER_EMAIL });
    if (existing) {
        console.log('User already exists:', USER_EMAIL);
        await mongoose.disconnect();
        return;
    }

    const hashed = await bcrypt.hash(USER_PASSWORD, 10);
    const user = await User.create({
        email: USER_EMAIL,
        password: hashed,
        name: USER_NAME,
        role: 'user'
    });

    console.log('User created:', user.email, '| Role:', user.role);
    await mongoose.disconnect();
}

createUser().catch(console.error);
