const User = require('../models/userModel');
const generateToken = require('../config/generateToken');

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const authUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const cleanEmail = email ? email.toString().trim().toLowerCase() : '';
    const cleanPassword = password ? password.toString().trim() : '';
    const envAdminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const envAdminPassword = (process.env.ADMIN_PASSWORD || '').trim();

    let user = await User.findOne({ email: cleanEmail });

    if (cleanEmail === envAdminEmail && cleanPassword === envAdminPassword) {
      if (!user) {
        user = new User({
          name: process.env.ADMIN_NAME || 'Admin M/S Sunflower Solar',
          email: envAdminEmail,
          phone: process.env.ADMIN_PHONE || '9874973079',
          password: envAdminPassword,
          role: 'admin',
          status: 'active',
        });
        await user.save();
      } else {
        const needsPasswordSync = !(await user.matchPassword(cleanPassword));
        if (needsPasswordSync || user.role !== 'admin' || user.status !== 'active' || user.isDeleted) {
          user.password = envAdminPassword;
          user.role = 'admin';
          user.status = 'active';
          user.isDeleted = false;
          await user.save();
        }
      }
    }

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (!(await user.matchPassword(cleanPassword))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (user.isDeleted) {
      return res.status(401).json({ message: 'Your account has been deleted. Please contact admin.' });
    }
    if (user.status === 'inactive') {
      return res.status(401).json({ message: 'Your account is inactive. Please contact admin.' });
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyDetails: user.companyDetails,
      token: generateToken(user._id, user.tokenVersion || 0),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const registerUser = async (req, res) => {
  try {
    const { name, email, phone, password, role } = req.body;
    const isAdminCreating = req.user && req.user.role === 'admin';
    
    const cleanEmail = email ? email.toString().trim().toLowerCase() : '';
    const cleanPassword = password ? password.toString().trim() : '';

    const user = new User({
      name,
      email: cleanEmail,
      phone,
      password: cleanPassword,
      role: isAdminCreating ? (role || 'staff') : 'admin',
      owner: isAdminCreating ? req.user._id : null,
    });

    await user.save();

    if (user) {
      // Return only essential fields to keep response clean and fast
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'A user with this email already exists.' });
    }
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all staff
// @route   GET /api/staff
// @access  Private/Admin
const getStaff = async (req, res) => {
  const adminId = req.user.role === 'admin' ? req.user._id : req.user.owner;
  const staff = await User.find({ 
    role: { $in: ['staff', 'telecaller'] }, 
    owner: adminId,
    isDeleted: { $ne: true }
  });
  res.json(staff);
};

// @desc    Delete staff (Soft Delete)
// @route   DELETE /api/staff/:id
// @access  Private/Admin
const deleteStaff = async (req, res) => {
  const user = await User.findById(req.params.id);

  if (user) {
    user.isDeleted = true;
    user.status = 'inactive';
    await user.save();
    res.json({ message: 'Staff member removed successfully (Data preserved)' });
  } else {
    res.status(404).json({ message: 'User not found' });
  }
};

// @desc    Get staff details with assigned leads
// @route   GET /api/staff/:id
// @access  Private/Admin
const getStaffDetails = async (req, res) => {
  try {
    const staff = await User.findById(req.params.id).select('-password');
    if (!staff) {
      return res.status(404).json({ message: 'Staff member not found' });
    }

    let leads = [];
    let contacts = [];

    if (staff.role === 'telecaller') {
      const Contact = require('../models/contactModel');
      contacts = await Contact.find({ assignedTo: req.params.id }).sort({ updatedAt: -1 });
    } else {
      const Lead = require('../models/leadModel');
      leads = await Lead.find({ assignedTo: req.params.id }).sort({ updatedAt: -1 });
    }

    res.json({
      staff,
      leads,
      contacts
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Toggle staff active/inactive status (Block/Unblock)
// @route   PATCH /api/staff/:id/toggle-status
// @access  Private/Admin
const toggleStaffStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify ownership
    if (user.owner && user.owner.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized to manage this staff member' });
    }

    user.status = user.status === 'active' ? 'inactive' : 'active';
    await user.save();

    res.json({
      message: `Staff member status updated to ${user.status}`,
      status: user.status
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update staff details (Admin only)
// @route   PUT /api/staff/:id
// @access  Private/Admin
const updateStaff = async (req, res) => {
  try {
    const { name, email, phone, role, password } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'Staff member not found' });
    }

    // Verify ownership
    if (user.owner && user.owner.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized to manage this staff member' });
    }

    // Check if email already exists for another user
    if (email) {
      const cleanEmail = email.toString().trim().toLowerCase();
      if (cleanEmail !== user.email.toLowerCase()) {
        const emailExists = await User.findOne({ email: cleanEmail });
        if (emailExists) {
          return res.status(400).json({ message: 'A user with this email already exists' });
        }
        user.email = cleanEmail;
      }
    }

    if (name) user.name = name;
    if (phone) user.phone = phone;
    if (role) user.role = role;

    if (password && password.toString().trim() !== '') {
      user.password = password.toString().trim();
      user.tokenVersion = (user.tokenVersion || 0) + 1;
    }

    await user.save();

    res.json({
      message: 'Staff member updated successfully',
      staff: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update user profile (email/password)
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { email, password } = req.body;

    if (email) {
      const cleanEmail = email.toString().trim().toLowerCase();
      if (cleanEmail !== user.email.toLowerCase()) {
        const emailExists = await User.findOne({ email: cleanEmail });
        if (emailExists) {
          return res.status(400).json({ message: 'Email is already in use by another account' });
        }
        user.email = cleanEmail;
      }
    }

    if (password && password.trim() !== '') {
      user.password = password.trim();
      user.tokenVersion = (user.tokenVersion || 0) + 1; // invalidate old tokens if needed
    }

    await user.save();

    res.json({
      message: 'Profile updated successfully',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        companyDetails: user.companyDetails,
        token: generateToken(user._id, user.tokenVersion)
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get analytics for all staff members (Leads & Contacts)
// @route   GET /api/staff/analytics
// @access  Private/Admin
const getStaffAnalytics = async (req, res) => {
  try {
    const adminId = req.user.role === 'admin' ? req.user._id : req.user.owner;
    
    // Fetch all staff members under this admin
    const staffMembers = await User.find({
      role: { $in: ['staff', 'telecaller'] },
      owner: adminId,
      isDeleted: { $ne: true }
    }).select('-password');

    const Lead = require('../models/leadModel');
    const Contact = require('../models/contactModel');

    // Process each staff member to get their analytics
    const analyticsData = await Promise.all(staffMembers.map(async (staff) => {
      let totalAssigned = 0;
      let statusCounts = {};
      let convertedCount = 0;
      let hotLeadsCount = 0;
      let lastActiveDate = null;

      if (staff.role === 'staff') {
        // Consultants manage Leads
        const leads = await Lead.find({ assignedTo: staff._id }).sort({ updatedAt: -1 });
        totalAssigned = leads.length;
        if (leads.length > 0) lastActiveDate = leads[0].updatedAt;

        leads.forEach(lead => {
          const status = lead.status || 'New';
          statusCounts[status] = (statusCounts[status] || 0) + 1;
          
          if (['Conversion', 'Meeting Won'].includes(status)) {
            convertedCount++;
          }
          if (['Meeting Done(Hot)', 'Meeting Schedule'].includes(status)) {
            hotLeadsCount++;
          }
        });
      } else if (staff.role === 'telecaller') {
        // Telecallers manage Contacts
        const contacts = await Contact.find({ assignedTo: staff._id }).sort({ updatedAt: -1 });
        totalAssigned = contacts.length;
        if (contacts.length > 0) lastActiveDate = contacts[0].updatedAt;

        contacts.forEach(contact => {
          const status = contact.status || 'New';
          statusCounts[status] = (statusCounts[status] || 0) + 1;

          if (['Converted'].includes(status)) {
            convertedCount++;
          }
          if (['Interested', 'Meeting Scheduled'].includes(status) || ['Meeting Scheduled', 'Meeting Done'].includes(contact.callingStatus)) {
            hotLeadsCount++;
          }
        });
      }

      const conversionRate = totalAssigned > 0 ? ((convertedCount / totalAssigned) * 100).toFixed(1) : 0;

      return {
        _id: staff._id,
        name: staff.name,
        email: staff.email,
        phone: staff.phone,
        role: staff.role,
        status: staff.status,
        totalAssigned,
        statusCounts,
        convertedCount,
        hotLeadsCount,
        conversionRate,
        lastActiveDate
      };
    }));

    res.json(analyticsData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { authUser, registerUser, getStaff, deleteStaff, getStaffDetails, toggleStaffStatus, updateStaff, updateProfile, getStaffAnalytics };
