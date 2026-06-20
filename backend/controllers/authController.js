/**
 * controllers/authController.js
 * ------------------------------------------------
 * Handles user registration, login, and profile retrieval.
 * Issues JWT tokens upon successful login/registration.
 */

const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '7d', // token valid for 7 days
  });
};

/**
 * POST /api/auth/register
 * Body: { email, password, fullName, phone? }
 */
exports.register = async (req, res) => {
  try {
    const { email, password, fullName, phone } = req.body;

    // Basic validation
    if (!email || !password || !fullName) {
      return res.status(400).json({ error: 'Please provide email, password, and full name' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create user (password will be hashed by pre-save hook)
    const user = await User.create({
      email,
      password,
      fullName,
      phone: phone || undefined,
    });

    // Generate token
    const token = generateToken(user._id);

    // Return user data (excluding password) and token
    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
};

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Please provide email and password' });
    }

    // Find user and include password field (since it's select: false)
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    // Generate token
    const token = generateToken(user._id);

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
};

/**
 * GET /api/auth/profile
 * Returns the authenticated user's data.
 */
exports.getProfile = async (req, res) => {
  try {
    // req.user is already set by protect middleware
    res.json({
      user: {
        id: req.user._id,
        email: req.user.email,
        fullName: req.user.fullName,
        phone: req.user.phone,
        role: req.user.role,
        createdAt: req.user.createdAt,
        lastLogin: req.user.lastLogin,
      },
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};
