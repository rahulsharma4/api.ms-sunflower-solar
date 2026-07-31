const express = require('express');
const router = express.Router();
const { createInvoice, getInvoices, deleteInvoice } = require('../controllers/invoiceController');
const { protect, admin } = require('../middleware/authMiddleware');

router.route('/').get(protect, getInvoices).post(protect, createInvoice);
router.route('/:id').delete(protect, admin, deleteInvoice);

module.exports = router;
