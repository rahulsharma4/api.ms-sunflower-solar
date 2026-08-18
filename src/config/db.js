const mongoose = require('mongoose');
const dns = require('dns');

// Use reliable Google/Cloudflare DNS servers to prevent querySrv ECONNREFUSED on local ISPs
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (e) {
  // Ignore if setting DNS fails
}

const connectDB = async () => {
  const connectWithRetry = async () => {
    try {
      const opts = {
        // Fail fast if server selection takes too long
        serverSelectionTimeoutMS: 10000,
      };

      const conn = await mongoose.connect(process.env.MONGODB_URI, opts);
      console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
      console.error('MongoDB Connection Error:', error && error.stack ? error.stack : error);
      console.log('Retrying MongoDB connection in 10 seconds...');
      setTimeout(connectWithRetry, 10000);
    }
  };

  await connectWithRetry();
};

module.exports = connectDB;
