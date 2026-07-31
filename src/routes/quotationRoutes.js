const express = require('express');
const router = express.Router();
const { createQuotation, getQuotations, getQuotationById, updateQuotation, updateFulfillmentStatus, updateEmiStatus } = require('../controllers/quotationController');
const { protect } = require('../middleware/authMiddleware');

router.route('/').get(protect, getQuotations).post(protect, createQuotation);
router.route('/:id').get(protect, getQuotationById).put(protect, updateQuotation);
router.route('/:id/fulfillment').patch(protect, updateFulfillmentStatus);
router.route('/:id/emi-status').patch(protect, updateEmiStatus);

module.exports = router;
