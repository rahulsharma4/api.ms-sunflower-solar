const express = require('express');
const router = express.Router();
const { authUser, updateProfile } = require('../controllers/userController');
const { connectFacebookPage, disconnectFacebookPage } = require('../controllers/fbController');
const { protect, admin } = require('../middleware/authMiddleware');

router.post('/facebook/connect', protect, admin, connectFacebookPage);
router.post('/facebook/disconnect', protect, admin, disconnectFacebookPage);
router.post('/login', authUser);
router.put('/profile', protect, updateProfile);
router.post('/register', (req, res) => {
  res.status(403).json({ message: 'Public registration is disabled. Please contact the administrator.' });
});

module.exports = router;
