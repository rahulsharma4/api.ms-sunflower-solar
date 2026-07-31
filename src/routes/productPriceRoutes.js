const express = require('express');
const router = express.Router();
const {
  getProductPrices,
  addProductPrice,
  updateProductPrice,
  deleteProductPrice,
} = require('../controllers/productPriceController');
const { protect, admin } = require('../middleware/authMiddleware');

router.route('/')
  .get(protect, getProductPrices)
  .post(protect, admin, addProductPrice);

router.route('/:id')
  .put(protect, admin, updateProductPrice)
  .delete(protect, admin, deleteProductPrice);

module.exports = router;
