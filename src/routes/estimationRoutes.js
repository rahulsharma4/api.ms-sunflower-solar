const express = require('express');
const router = express.Router();
const {
  getEstimations,
  getEstimation,
  createEstimation,
  updateEstimationStatus,
  deleteEstimation,
} = require('../controllers/estimationController');
const { protect, admin } = require('../middleware/authMiddleware');

router.use(protect);

router.route('/')
  .get(getEstimations)
  .post(createEstimation);

router.route('/:id')
  .get(getEstimation)
  .delete(admin, deleteEstimation);

router.route('/:id/status')
  .patch(updateEstimationStatus);

module.exports = router;
