const mongoose = require('mongoose');

// Lightweight health endpoint for debugging production
const health = (req, res) => {
  try {
    const mongoState = mongoose && mongoose.connection ? mongoose.connection.readyState : 0;
    // readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    res.json({
      ok: true,
      nodeEnv: process.env.NODE_ENV || 'unknown',
      env: {
        MONGODB_URI: !!process.env.MONGODB_URI,
        JWT_SECRET: !!process.env.JWT_SECRET,
      },
      mongoReadyState: mongoState,
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
};

module.exports = { health };
