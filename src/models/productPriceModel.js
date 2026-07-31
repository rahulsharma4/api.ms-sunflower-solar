const mongoose = require('mongoose');

const productPriceSchema = mongoose.Schema(
  {
    category: {
      type: String,
      required: true,
      enum: ['System Size', 'Solar Panel', 'Inverter Details'],
    },
    name: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      default: 0,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const ProductPrice = mongoose.model('ProductPrice', productPriceSchema);

module.exports = ProductPrice;
