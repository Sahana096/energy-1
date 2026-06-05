const User = require('../models/User');
const EnergyUsage = require('../models/EnergyUsage');
const Device = require('../models/Device');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'energyai_fallback_secret';
const JWT_EXPIRES_IN = '7d';

function generateToken(user) {
  return jwt.sign(
    { userId: user._id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

let testAccount = null;
let transporter = null;

async function getTransporter() {
  if (transporter) return { transporter, testAccount };

  const realHost = process.env.SMTP_HOST;
  const realUser = process.env.SMTP_USER;
  const realPass = process.env.SMTP_PASS;

  if (realHost && realUser && realPass) {
    transporter = nodemailer.createTransport({
      host: realHost,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: { user: realUser, pass: realPass }
    });
    return { transporter, testAccount: null };
  }

  testAccount = await nodemailer.createTestAccount();
  transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass
    }
  });
  return { transporter, testAccount };
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const sendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Email not registered. Please sign up first.' });
    }

    const otp = generateOTP();
    const expiry = new Date(Date.now() + 10 * 60 * 1000);
    user.otp = otp;
    user.otpExpiry = expiry;
    await user.save();

    const { transporter, testAccount } = await getTransporter();
    const info = await transporter.sendMail({
      from: '"EnergyAI" <noreply@energyai.com>',
      to: email,
      subject: 'Your EnergyAI Login OTP',
      html: `
        <div style="font-family:Segoe UI,sans-serif;max-width:400px;margin:auto;padding:2rem;background:#111;color:#fff;border-radius:1rem;">
          <h2 style="color:#FFD700;text-align:center;">EnergyAI</h2>
          <p style="text-align:center;color:#aaa;">Your one-time password is:</p>
          <div style="text-align:center;font-size:2.5rem;font-weight:bold;color:#FFD700;letter-spacing:0.5rem;margin:1rem 0;">${otp}</div>
          <p style="text-align:center;color:#aaa;font-size:0.85rem;">Valid for 10 minutes. Do not share this code.</p>
        </div>
      `
    });

    const isRealSMTP = !testAccount;
    const previewUrl = isRealSMTP ? null : nodemailer.getTestMessageUrl(info);
    console.log(`OTP sent to ${email}: ${otp}`);
    if (previewUrl) console.log(`Email preview: ${previewUrl}`);

    res.json({
      success: true,
      message: isRealSMTP ? 'OTP sent to your email' : 'OTP sent (demo mode)',
      // Never expose OTP in response — only log it server-side in dev
      data: { previewUrl }
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP required' });
    }

    const user = await User.findOne({ email });
    if (!user || !user.otp || !user.otpExpiry) {
      return res.status(400).json({ success: false, message: 'OTP not requested' });
    }

    if (user.otp !== otp) {
      return res.status(401).json({ success: false, message: 'Invalid OTP' });
    }

    if (new Date() > user.otpExpiry) {
      return res.status(401).json({ success: false, message: 'OTP expired' });
    }

    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    const token = generateToken(user);

    res.json({
      success: true,
      data: { token, user: { email: user.email, name: user.name, role: user.role } }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    let isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user);

    res.json({
      success: true,
      data: { token, user: { email: user.email, name: user.name, role: user.role } }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email and password required' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashedPassword, role: 'user' });
    const token = generateToken(user);

    res.status(201).json({
      success: true,
      data: { token, user: { email: user.email, name: user.name, role: user.role } }
    });re
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const logout = (req, res) => {
  res.json({ success: true, message: 'Logged out' });
};

// Get all users (admin only)
const getAllUsers = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const users = await User.find({}).select('-password').sort({ createdAt: -1 });
    
    // Get additional stats for each user
    const usersWithStats = await Promise.all(users.map(async (user) => {
      const energyCount = await EnergyUsage.countDocuments({ userId: user._id });
      const deviceCount = await Device.countDocuments({ userId: user._id });
      
      return {
        ...user.toObject(),
        stats: {
          energyRecords: energyCount,
          devices: deviceCount
        }
      };
    }));

    res.json({
      success: true,
      data: { totalUsers: usersWithStats.length, users: usersWithStats }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { login, register, logout, sendOTP, verifyOTP, getAllUsers };
