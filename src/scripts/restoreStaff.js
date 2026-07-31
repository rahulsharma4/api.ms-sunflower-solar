const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/userModel');

const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const restoreStaff = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    
    console.log('Restoring deleted staff...');
    const result = await User.updateMany({ isDeleted: true }, { $set: { isDeleted: false, status: 'active' } });
    
    console.log(`Successfully restored ${result.modifiedCount} deleted staff members.`);
    process.exit(0);
  } catch (error) {
    console.error('Error during restoration:', error);
    process.exit(1);
  }
};

restoreStaff();
