const express = require('express');
const router = express.Router();
const { createLead, getLeads, updateLead, deleteLead, logPhoneView, createPublicReferral, handleGoogleFormWebhook } = require('../controllers/leadController');
const { verifyWebhook, receiveWebhook } = require('../controllers/fbController');
const { handleWebsiteWebhook } = require('../controllers/contactController');
const { protect, admin } = require('../middleware/authMiddleware');

// Public Route
router.post('/public-referral', createPublicReferral);
router.post('/google-form-webhook', handleGoogleFormWebhook);
router.post('/website-webhook', handleWebsiteWebhook);
router.post('/webhook', handleWebsiteWebhook);

// Facebook Webhook Routes (Public)
router.get('/facebook/webhook', verifyWebhook);
router.post('/facebook/webhook', receiveWebhook);

const handleOptionalWebsiteLead = (req, res, next) => {
  if (!req.headers.authorization && req.body && (req.body.fullName || req.body.whatsappNumber || req.body.type || req.body.pinCode || req.body.phone || req.body.mobile || req.body.name)) {
    return handleWebsiteWebhook(req, res);
  }
  return protect(req, res, next);
};

router.route('/')
  .post(handleOptionalWebsiteLead, createLead)
  .get(protect, getLeads);

router.route('/:id')
  .patch(protect, updateLead)
  .delete(protect, admin, deleteLead);

router.post('/:id/log-view-phone', protect, logPhoneView);

module.exports = router;
