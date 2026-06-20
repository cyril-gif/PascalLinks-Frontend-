/**
 * seedAdmin.js
 * ------------------------------------------------
 * One‑time script to create an admin user.
 * Run with: node scripts/seedAdmin.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const createAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const adminEmail = 'cyrillantam@gmail.com';
    const adminPassword = '1122pascal'; // change this
    const existing = await User.findOne({ email: adminEmail });
    if (existing) {
      console.log('Admin already exists:', adminEmail);
      process.exit(0);
    }

    const admin = new User({
      email: adminEmail,
      password: adminPassword,
      fullName: 'Super Admin',
      role: 'admin',
    });
    await admin.save();
    console.log(`✅ Admin created: ${adminEmail} / ${adminPassword}`);
    process.exit(0);
  } catch (err) {
    console.error('Error creating admin:', err);
    process.exit(1);
  }
};

createAdmin();
