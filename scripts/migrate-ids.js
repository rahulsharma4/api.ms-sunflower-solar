require('dotenv').config();
const mongoose = require('mongoose');
const Lead = require('../src/models/leadModel');
const Quotation = require('../src/models/quotationModel');
const { getNextSequenceValue } = require('../src/utils/counter');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

const migrateData = async () => {
  await connectDB();

  try {
    // 1. Migrate Leads
    console.log('Migrating Leads...');
    const leads = await Lead.find({ leadId: { $exists: false } });
    console.log(`Found ${leads.length} leads without leadId.`);
    
    for (const lead of leads) {
      const isReferral = lead.source === 'Employee Referral' || lead.source === 'Existing Customer Referral';
      let newId;
      if (isReferral) {
        const seq = await getNextSequenceValue('referral_counter');
        newId = `RUP${seq.toString().padStart(3, '0')}`;
      } else {
        const seq = await getNextSequenceValue('lead_counter');
        newId = `LUP${seq.toString().padStart(3, '0')}`;
      }
      
      lead.leadId = newId;
      await lead.save({ validateBeforeSave: false }); // Avoid triggering pre-save hook accidentally if other fields are invalid
      console.log(`Updated Lead ${lead.name} -> ${newId}`);
    }

    // 2. Migrate Quotations/Orders
    console.log('Migrating Quotations...');
    const quotations = await Quotation.find({ orderId: { $exists: false } });
    console.log(`Found ${quotations.length} quotations without orderId.`);
    
    for (const quote of quotations) {
      const orderSeq = await getNextSequenceValue('order_counter');
      const newOrderId = `SLS${orderSeq.toString().padStart(3, '0')}`;
      
      quote.orderId = newOrderId;
      await quote.save({ validateBeforeSave: false });
      console.log(`Updated Quotation ${quote.quotationNo} -> ${newOrderId}`);
    }

    console.log('Migration Completed Successfully!');
    process.exit(0);
  } catch (error) {
    console.error(`Migration Failed:`, error);
    process.exit(1);
  }
};

migrateData();
