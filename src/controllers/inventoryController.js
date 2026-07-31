const Inventory = require('../models/inventoryModel');

// @desc    Get all inventory items
// @route   GET /api/inventory
// @access  Private
const getInventoryItems = async (req, res) => {
  try {
    const items = await Inventory.find().sort({ createdAt: -1 });
    res.status(200).json(items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single inventory item
// @route   GET /api/inventory/:id
// @access  Private
const getInventoryItem = async (req, res) => {
  try {
    const item = await Inventory.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    res.status(200).json(item);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create new inventory item
// @route   POST /api/inventory
// @access  Private/Admin
const createInventoryItem = async (req, res) => {
  try {
    const existingItem = await Inventory.findOne({ productId: req.body.productId });
    if (existingItem) {
      return res.status(400).json({ message: 'Product ID/SKU already exists' });
    }

    const itemData = {
      ...req.body,
      history: [{
        action: 'INITIAL_STOCK',
        quantityChange: req.body.quantity || 0,
        remark: 'Initial stock added'
      }]
    };

    const item = await Inventory.create(itemData);
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update inventory item
// @route   PATCH /api/inventory/:id
// @access  Private/Admin
const updateInventoryItem = async (req, res) => {
  try {
    const item = await Inventory.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    const oldQuantity = item.quantity;
    const newQuantity = req.body.quantity !== undefined ? req.body.quantity : oldQuantity;
    
    if (newQuantity !== oldQuantity) {
      item.history.push({
        action: 'MANUAL_ADJUSTMENT',
        quantityChange: newQuantity - oldQuantity,
        remark: `Stock manually updated by user`
      });
    }

    // Update other fields
    Object.keys(req.body).forEach(key => {
      item[key] = req.body[key];
    });

    await item.save();

    res.status(200).json(item);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete inventory item
// @route   DELETE /api/inventory/:id
// @access  Private/Admin
const deleteInventoryItem = async (req, res) => {
  try {
    const item = await Inventory.findByIdAndDelete(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    res.status(200).json({ message: 'Item deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Bulk create inventory items
// @route   POST /api/inventory/bulk
// @access  Private/Admin
const bulkCreateInventory = async (req, res) => {
  try {
    const itemsList = Array.isArray(req.body) ? req.body : req.body.items;
    if (!itemsList || !Array.isArray(itemsList)) {
      return res.status(400).json({ message: 'Invalid data format. Expected an array.' });
    }

    const formattedItems = [];
    const existingProductIds = new Set();
    const existingDbItems = await Inventory.find({}, 'productId');
    existingDbItems.forEach(item => existingProductIds.add(item.productId));

    for (const item of itemsList) {
      if (!item.productId || !item.productName) continue;
      
      // Skip if productId already exists
      if (existingProductIds.has(item.productId)) continue;
      
      existingProductIds.add(item.productId);
      
      formattedItems.push({
        productId: item.productId,
        productName: item.productName,
        category: item.category || 'Uncategorized',
        productType: item.productType || 'Standard',
        brandName: item.brandName || 'Unknown',
        modelNumber: item.modelNumber || '',
        description: item.description || '',
        hsnCode: item.hsnCode || '',
        quantity: Number(item.quantity) || 0,
        uom: item.uom || 'Nos',
        price: Number(item.price) || 0,
        history: [{
          action: 'INITIAL_STOCK',
          quantityChange: Number(item.quantity) || 0,
          remark: 'Bulk imported initial stock'
        }]
      });
    }

    if (formattedItems.length === 0) {
      return res.status(400).json({ message: 'No valid or new items found to import.' });
    }

    const createdItems = await Inventory.insertMany(formattedItems);
    res.status(201).json({ message: `Successfully imported ${createdItems.length} items.`, count: createdItems.length, data: createdItems });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  getInventoryItems,
  getInventoryItem,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  bulkCreateInventory,
};
