const ProductPrice = require('../models/productPriceModel');

// @desc    Get all product prices (Private)
// @route   GET /api/product-prices
// @access  Private
const getProductPrices = async (req, res) => {
  try {
    const ownerId = req.user.role === 'admin' ? req.user._id : req.user.owner;
    const prices = await ProductPrice.find({ owner: ownerId }).sort({ category: 1, name: 1 });
    res.json(prices);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Add a new product price (Admin only)
// @route   POST /api/product-prices
// @access  Private/Admin
const addProductPrice = async (req, res) => {
  const { category, name, price } = req.body;

  try {
    if (!category || !name || price === undefined) {
      return res.status(400).json({ message: 'Please provide all fields' });
    }

    const priceExists = await ProductPrice.findOne({
      category,
      name,
      owner: req.user._id,
    });

    if (priceExists) {
      return res.status(400).json({ message: 'A price record with this category and name already exists' });
    }

    const productPrice = await ProductPrice.create({
      category,
      name,
      price: Number(price) || 0,
      owner: req.user._id,
    });

    res.status(201).json(productPrice);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update a product price (Admin only)
// @route   PUT /api/product-prices/:id
// @access  Private/Admin
const updateProductPrice = async (req, res) => {
  const { category, name, price } = req.body;

  try {
    const productPrice = await ProductPrice.findById(req.params.id);

    if (!productPrice) {
      return res.status(404).json({ message: 'Product price record not found' });
    }

    // Verify owner
    if (productPrice.owner.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized to update this record' });
    }

    if (category) productPrice.category = category;
    if (name) productPrice.name = name;
    if (price !== undefined) productPrice.price = Number(price) || 0;

    const updatedPrice = await productPrice.save();
    res.json(updatedPrice);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete a product price (Admin only)
// @route   DELETE /api/product-prices/:id
// @access  Private/Admin
const deleteProductPrice = async (req, res) => {
  try {
    const productPrice = await ProductPrice.findById(req.params.id);

    if (!productPrice) {
      return res.status(404).json({ message: 'Product price record not found' });
    }

    // Verify owner
    if (productPrice.owner.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized to delete this record' });
    }

    await ProductPrice.findByIdAndDelete(req.params.id);
    res.json({ message: 'Product price record removed' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  getProductPrices,
  addProductPrice,
  updateProductPrice,
  deleteProductPrice,
};
