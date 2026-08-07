const express = require('express');
const router = express.Router();
const { addPayment, getPayments, updatePayment, deletePayment } = require('../controllers/paymentController');
const { protect, admin } = require('../middleware/authMiddleware');

router.route('/')
  .post(protect, addPayment)
  .get(protect, getPayments);

router.route('/:id')
  .put(protect, admin, updatePayment)
  .delete(protect, admin, deletePayment);

module.exports = router;
