const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./src/config/db');

// Load env vars
dotenv.config();

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
  res.send('Divya Eco Ventures CRM API is running...');
});

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  // Start the background reminder scheduler
  const { startReminderScheduler } = require('./src/utils/scheduler');
  startReminderScheduler();
});
