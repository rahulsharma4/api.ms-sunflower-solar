const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./src/config/db');

// Load env vars
dotenv.config();

// Ensure `crypto` is available on `globalThis` for MongoDB driver (SCRAM-SHA256).
// Some Node runtimes used by hosts do not expose `globalThis.crypto` by default.
try {
  if (typeof globalThis.crypto === 'undefined') {
    // eslint-disable-next-line global-require
    globalThis.crypto = require('crypto');
  }
} catch (e) {
  // If this fails, connection will likely error later and logs will show the cause.
  console.warn('Warning: unable to polyfill globalThis.crypto:', e && e.message ? e.message : e);
}

// Validate required environment variables early so runtime errors are clearer
const envPresent = key => !!(process.env[key] && process.env[key].toString().trim() !== '');
const mongouri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET || process.env.SECRET || process.env.APP_JWT_SECRET;
const missing = [];
if (!mongouri || mongouri.toString().trim() === '') missing.push('MONGODB_URI (or MONGO_URI / DATABASE_URL)');
if (!jwtSecret || jwtSecret.toString().trim() === '') missing.push('JWT_SECRET (or SECRET / APP_JWT_SECRET)');

if (missing.length) {
  console.error('Missing required environment variables:', missing.join(', '));
  // Do not exit in development to allow local convenience, but exit in production
  if ((process.env.NODE_ENV || '').toString().trim() === 'production') {
    console.error('Exiting because required environment variables are missing.');
    process.exit(1);
  }
}

// Connect to database
connectDB();

const app = express();

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Enable CORS
app.use(cors({
  origin: function (origin, callback) {
    // Allow all origins
    callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Dev logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Serve static uploads
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', require('./src/routes/authRoutes'));
app.use('/api/staff', require('./src/routes/staffRoutes'));
app.use('/api/leads', require('./src/routes/leadRoutes'));
app.use('/api/payments', require('./src/routes/paymentRoutes'));
app.use('/api/dashboard', require('./src/routes/dashboardRoutes'));
app.use('/api/quotations', require('./src/routes/quotationRoutes'));
app.use('/api/invoices', require('./src/routes/invoiceRoutes'));
app.use('/api/notifications', require('./src/routes/notificationRoutes'));
app.use('/api/contacts', require('./src/routes/contactRoutes'));
app.use('/api/product-prices', require('./src/routes/productPriceRoutes'));
app.use('/api/inventory', require('./src/routes/inventoryRoutes'));
app.use('/api/estimations', require('./src/routes/estimationRoutes'));
app.use('/api/upload', require('./src/routes/uploadRoutes'));
app.post('/api/website-webhook', require('./src/controllers/contactController').handleWebsiteWebhook);
app.post('/api/webhook', require('./src/controllers/contactController').handleWebsiteWebhook);


app.get('/', (req, res) => {
  res.send('M/S Sunflower Solar CRM API is running...');
});

// Health endpoint for quick debugging (reports env presence and DB ready state)
app.get('/api/health', require('./src/controllers/healthController').health);

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  // Start the background reminder scheduler
  const { startReminderScheduler } = require('./src/utils/scheduler');
  startReminderScheduler();
});
