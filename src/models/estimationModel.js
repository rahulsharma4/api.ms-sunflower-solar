const mongoose = require('mongoose');

const estimationItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Inventory',
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  price: {
    type: Number,
    required: true,
  },
});

const estimationSchema = new mongoose.Schema({
  customerName: {
    type: String,
    required: true,
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    // Depending on what is referenced, could be Lead or Contact
    // Storing as ObjectId without explicit ref to allow flexibility or just use string
  },
  customerType: {
    type: String,
    enum: ['Lead', 'Contact'],
    default: 'Lead',
  },
  items: [estimationItemSchema],
  totalAmount: {
    type: Number,
    required: true,
    default: 0,
  },
  status: {
    type: String,
    enum: ['Draft', 'Finalized', 'Cancelled'],
    default: 'Draft',
  },
  notes: {
    type: String,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Estimation', estimationSchema);
