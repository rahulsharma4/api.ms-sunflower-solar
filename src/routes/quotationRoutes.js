const express = require('express');
const router = express.Router();
const { createQuotation, getQuotations, getQuotationById, updateQuotation, deleteQuotation, updateFulfillmentStatus, updateEmiStatus } = require('../controllers/quotationController');
const { protect, admin } = require('../middleware/authMiddleware');

router.route('/').get(protect, getQuotations).post(protect, createQuotation);
router.route('/:id')
  .get(protect, getQuotationById)
  .put(protect, updateQuotation)
  .delete(protect, admin, deleteQuotation);
router.route('/:id/fulfillment').patch(protect, updateFulfillmentStatus);
router.route('/:id/emi-status').patch(protect, updateEmiStatus);

module.exports = router;
