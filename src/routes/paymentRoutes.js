const express = require('express');
const router = express.Router();
const { addPayment, getPayments } = require('../controllers/paymentController');
const { protect } = require('../middleware/authMiddleware');

router.route('/')
  .post(protect, addPayment)
  .get(protect, getPayments);

module.exports = router;
