const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/userModel');
const Contact = require('../models/contactModel');
const Lead = require('../models/leadModel');
const Invoice = require('../models/invoiceModel');
const Notification = require('../models/notificationModel');
const Payment = require('../models/paymentModel');
const Quotation = require('../models/quotationModel');

// Load environment variables
dotenv.config();

const cleanAndSeed = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected successfully!');

    // Delete all records in all relevant collections
    console.log('Clearing old data from database...');
    
    const usersResult = await User.deleteMany({});
    console.log(`Cleared Users collection. Deleted ${usersResult.deletedCount} documents.`);

    const contactsResult = await Contact.deleteMany({});
    console.log(`Cleared Contacts collection. Deleted ${contactsResult.deletedCount} documents.`);

    const leadsResult = await Lead.deleteMany({});
    console.log(`Cleared Leads collection. Deleted ${leadsResult.deletedCount} documents.`);

    const invoicesResult = await Invoice.deleteMany({});
    console.log(`Cleared Invoices collection. Deleted ${invoicesResult.deletedCount} documents.`);

    const notificationsResult = await Notification.deleteMany({});
    console.log(`Cleared Notifications collection. Deleted ${notificationsResult.deletedCount} documents.`);

    const paymentsResult = await Payment.deleteMany({});
    console.log(`Cleared Payments collection. Deleted ${paymentsResult.deletedCount} documents.`);

    const quotationsResult = await Quotation.deleteMany({});
    console.log(`Cleared Quotations collection. Deleted ${quotationsResult.deletedCount} documents.`);

    console.log('Creating new Admin user account...');
    
    // Create new admin user
    const adminUser = new User({
      name: process.env.ADMIN_NAME || 'Admin Divya Eco Ventures',
      email: process.env.ADMIN_EMAIL || 'admin@divyaecoventures.com',
      phone: process.env.ADMIN_PHONE || '9235617197',
      password: process.env.ADMIN_PASSWORD || 'Admin@divya123', // Hashes automatically via userModel's pre-save middleware
      role: 'admin',
      status: 'active'
    });

    await adminUser.save();
    console.log('\n==================================================');
    console.log('✅ DATABASE SEEDING COMPLETED SUCCESSFULLY!');
    console.log('==================================================');
    console.log(`Admin User : ${adminUser.name}`);
    console.log(`Email      : ${adminUser.email}`);
    console.log(`Password   : ${process.env.ADMIN_PASSWORD || 'Admin@divya123'}`);
    console.log('Role:     admin');
    console.log('--------------------------------------------------');
    console.log('Database Reset & Clean Setup Completed Successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Error during database clean/seed:', error);
    process.exit(1);
  }
};

cleanAndSeed();
