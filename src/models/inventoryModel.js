const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
  productId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  productName: {
    type: String,
    required: true,
    trim: true,
  },
  category: {
    type: String,
    required: true,
    trim: true,
  },
  productType: {
    type: String,
    required: true,
    trim: true,
  },
  brandName: {
    type: String,
    required: true,
    trim: true,
  },
  modelNumber: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  hsnCode: {
    type: String,
    trim: true,
  },
  quantity: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
  },
  uom: {
    type: String,
    required: true,
    trim: true,
  },
  price: {
    type: Number,
    required: true,
    default: 0,
  },
  image: {
    type: String,
    trim: true,
    default: ''
  },
  history: [{
    action: {
      type: String,
      enum: ['INITIAL_STOCK', 'MANUAL_ADJUSTMENT', 'ESTIMATION_FINALIZED', 'ESTIMATION_CANCELLED', 'ESTIMATION_DELETED'],
      required: true
    },
    quantityChange: {
      type: Number,
      required: true
    },
    remark: {
      type: String
    },
    date: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('Inventory', inventorySchema);
