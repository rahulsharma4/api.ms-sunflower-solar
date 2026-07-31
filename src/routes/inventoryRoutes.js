const express = require('express');
const router = express.Router();
const {
  getInventoryItems,
  getInventoryItem,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  bulkCreateInventory,
} = require('../controllers/inventoryController');
const { protect, admin } = require('../middleware/authMiddleware');

// Using protect middleware for all routes
router.use(protect);

router.route('/bulk')
  .post(admin, bulkCreateInventory);

router.route('/')
  .get(getInventoryItems)
  .post(admin, createInventoryItem);

router.route('/:id')
  .get(getInventoryItem)
  .patch(admin, updateInventoryItem)
  .delete(admin, deleteInventoryItem);

module.exports = router;
