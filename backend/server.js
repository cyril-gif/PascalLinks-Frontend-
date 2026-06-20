/**
 * server.js
 * ------------------------------------------------
 * Entry point of the backend application.
 * Sets up Express, connects to MongoDB, loads environment variables,
 * and mounts all API routes.
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { generalLimiter } = require('./middleware/rateLimiter');

// Import routes
const authRoutes = require('./routes/auth');
const orderRoutes = require('./routes/orders');
const planRoutes = require('./routes/plans');
// ... after other imports
const adminRoutes = require('./routes/admin');
const webhookRoutes = require('./routes/webhook');


// TODO: adminRoutes, webhookRoutes will be added later

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
// server.js

const cors = require('cors');

// Allow your Vercel frontend only
const allowedOrigins = [
  'https://pascallinks.vercel.app',
  'http://localhost:3000', // for local dev if needed
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // allow cookies if needed
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Global rate limiting (optional, we have per-route limiters too)
app.use(generalLimiter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/admin', adminRoutes);      // to be added
app.use('/api/webhook', webhookRoutes);  // to be added

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack || err);
  res.status(500).json({ error: 'Internal server error' });
});

// Connect to MongoDB and start server
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('✅ MongoDB connected successfully');
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  })
  .catch((error) => {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.disconnect();
  console.log('🛑 Server shut down gracefully');
  process.exit(0);
});
