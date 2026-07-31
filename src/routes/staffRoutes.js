const express = require('express');
const router = express.Router();
const { getStaff, deleteStaff, registerUser, getStaffDetails, toggleStaffStatus, updateStaff, getStaffAnalytics } = require('../controllers/userController');
const { protect, admin } = require('../middleware/authMiddleware');

router.route('/')
  .get(protect, getStaff)
  .post(protect, admin, registerUser);

router.route('/analytics')
  .get(protect, admin, getStaffAnalytics);

router.route('/:id')
  .get(protect, admin, getStaffDetails)
  .put(protect, admin, updateStaff)
  .delete(protect, admin, deleteStaff);

router.route('/:id/toggle-status')
  .patch(protect, admin, toggleStaffStatus);

module.exports = router;
