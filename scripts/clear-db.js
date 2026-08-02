require('dotenv').config();
const mongoose = require('mongoose');

// Import all models
const User = require('../src/models/userModel');
const Lead = require('../src/models/leadModel');
const Quotation = require('../src/models/quotationModel');
const Payment = require('../src/models/paymentModel');
const Invoice = require('../src/models/invoiceModel');
const Notification = require('../src/models/notificationModel');
const Counter = require('../src/models/counterModel');
const Estimation = require('../src/models/estimationModel');
const Contact = require('../src/models/contactModel');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

const clearData = async () => {
  await connectDB();

  try {
    console.log('Starting Database Cleanup...');

    // Delete transactional data
    await Lead.deleteMany({});
    console.log('Cleared all Leads');

    await Quotation.deleteMany({});
    console.log('Cleared all Quotations');

    await Payment.deleteMany({});
    console.log('Cleared all Payments');

    await Invoice.deleteMany({});
    console.log('Cleared all Invoices');

    await Notification.deleteMany({});
    console.log('Cleared all Notifications');

    await Estimation.deleteMany({});
    console.log('Cleared all Estimations');

    await Contact.deleteMany({});
    console.log('Cleared all Contacts');

    // Delete counters to reset sequence IDs (LUP, RUP, AVP)
    await Counter.deleteMany({});
    console.log('Cleared all Counters (Sequence IDs Reset)');

    // Delete all users EXCEPT the admin
    const adminEmail = process.env.ADMIN_EMAIL || 'volthut@gmail.com';
    const result = await User.deleteMany({ email: { $ne: adminEmail } });
    console.log(`Cleared ${result.deletedCount} Users (Main Admin Retained)`);

    console.log('Database successfully cleared for production use!');
    process.exit(0);
  } catch (error) {
    console.error(`Cleanup Failed:`, error);
    process.exit(1);
  }
};

clearData();
