const Lead = require('../models/leadModel');
const Notification = require('../models/notificationModel');

// @desc    Create a new lead
// @route   POST /api/leads
// @access  Private
const createLead = async (req, res) => {
  const { name, email, phone, address, monthlyBill, solarCapacity, roofType, propertyType, source, assignedTo, personalInfo, referredByStaff, referredByCustomer, paymentMode } = req.body;

  try {
    const lead = await Lead.create({
      name,
      email,
      phone,
      address,
      monthlyBill: monthlyBill || '0-1000',
      solarCapacity,
      roofType,
      propertyType,
      source: source || 'Direct',
      referredByStaff: referredByStaff || null,
      referredByCustomer: referredByCustomer || null,
      paymentMode: paymentMode || 'Direct',
      personalInfo,
      assignedTo: assignedTo || req.user._id,
      createdBy: req.user._id,
      owner: req.user.role === 'admin' ? req.user._id : req.user.owner,
    });

    res.status(201).json(lead);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Create a new lead from public referral form
// @route   POST /api/leads/public-referral
// @access  Public
const createPublicReferral = async (req, res) => {
  const { name, email, phone, source, referrerDetails, remarks } = req.body;

  try {
    const User = require('../models/userModel');
    // Find the main admin to assign as owner
    const adminUser = await User.findOne({ role: 'admin' });

    if (!adminUser) {
      return res.status(500).json({ message: 'System configuration error. Admin not found.' });
    }

    const lead = await Lead.create({
      name,
      email,
      phone,
      address: 'Not Provided (Public Form)',
      monthlyBill: 'Below 1800 rs',
      source: source || 'Direct',
      referrerDetails,
      owner: adminUser._id,
      createdBy: adminUser._id,
      status: 'Open(Not Assigned Yet)'
    });

    // Add remark if provided
    if (remarks) {
      lead.history.push({
        status: lead.status,
        comment: `Public Form Referral Remark: ${remarks}`,
      });
      await lead.save();
    }

    res.status(201).json({ message: 'Referral submitted successfully', lead });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Handle incoming Google Forms webhook
// @route   POST /api/leads/google-form-webhook
// @access  Public
const handleGoogleFormWebhook = async (req, res) => {
  // Google Apps Script will send data in req.body
  const { name, phone, email, source, referrerDetails, remarks, address } = req.body;

  try {
    const User = require('../models/userModel');
    // Find the main admin to assign as owner
    const adminUser = await User.findOne({ role: 'admin' });

    if (!adminUser) {
      return res.status(500).json({ message: 'System configuration error. Admin not found.' });
    }

    // Map source to valid enum
    let mappedSource = source || 'Digital';
    if (mappedSource === 'BTL Lead Referral') {
      mappedSource = 'BTL';
    }

    const lead = await Lead.create({
      name: name || 'Google Form Lead',
      email: email || '',
      phone: phone || 'Not Provided',
      address: address || 'Not Provided (Google Form)',
      monthlyBill: 'Below 1800 rs',
      source: mappedSource,
      referrerDetails: referrerDetails || 'Google Form',
      owner: adminUser._id,
      createdBy: adminUser._id,
      status: 'Open(Not Assigned Yet)'
    });

    // Add remark if provided
    if (remarks) {
      lead.history.push({
        status: lead.status,
        comment: `Google Form Referral Remark: ${remarks}`,
      });
      await lead.save();
    }

    res.status(201).json({ message: 'Google Form webhook received successfully', lead });
  } catch (error) {
    console.error('Google Form Webhook Error:', error);
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get all leads (Admin: all, Staff: assigned only)
// @route   GET /api/leads
// @access  Private
const getLeads = async (req, res) => {
  try {
    let query = {};
    if (req.user.role !== 'admin') {
      query.owner = req.user.owner;
      query.assignedTo = req.user._id;
    }

    const leads = await Lead.find(query)
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name')
      .populate('referredByStaff', 'name')
      .populate('referredByCustomer', 'name phone')
      .populate('history.updatedBy', 'name');
    res.json(leads);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update lead status or details
// @route   PATCH /api/leads/:id
// @access  Private
const updateLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);

    if (lead) {
      // Check if lead is closed
      if (lead.status === 'Closed') {
        return res.status(400).json({ message: 'This lead is closed and cannot be modified' });
      }

      // Check if staff is authorized to update this lead
      if (req.user.role !== 'admin' && lead.assignedTo.toString() !== req.user._id.toString()) {
        return res.status(401).json({ message: 'Not authorized to update this lead' });
      }

      if (req.body.status && req.body.status !== lead.status) {
        // Clear follow-up if status moves to 'Meeting Done' or 'Meeting Won'
        const completionStatuses = ['Meeting Done(Hot)', 'Meeting Done(Moderate)', 'Meeting Done(Cold)', 'Meeting Won'];
        if (completionStatuses.includes(req.body.status)) {
          lead.followUpDate = null;
          lead.followUpStatus = 'Completed';
        }

        lead.history.push({
          status: req.body.status,
          comment: req.body.comment || 'Status updated',
          updatedBy: req.user._id,
        });
        lead.status = req.body.status;
      }

      lead.name = req.body.name || lead.name;
      lead.email = req.body.email || lead.email;
      lead.phone = req.body.phone || lead.phone;
      lead.address = req.body.address || lead.address;
      lead.monthlyBill = req.body.monthlyBill || lead.monthlyBill || '0-1000';
      lead.solarCapacity = req.body.solarCapacity || lead.solarCapacity;
      lead.roofType = req.body.roofType || lead.roofType;
      lead.propertyType = req.body.propertyType || lead.propertyType;
      lead.paymentMode = req.body.paymentMode || lead.paymentMode || 'Direct';
      lead.followUpDate = req.body.followUpDate || lead.followUpDate;
      lead.followUpStatus = req.body.followUpStatus || lead.followUpStatus;
      lead.followUpRemarks = req.body.followUpRemarks || lead.followUpRemarks;
      lead.quotationAmount = req.body.quotationAmount || lead.quotationAmount;
      lead.technicalRemarks = req.body.technicalRemarks || lead.technicalRemarks;
      lead.companyName = req.body.companyName || lead.companyName;
      lead.companyAddress = req.body.companyAddress || lead.companyAddress;
      lead.gstNumber = req.body.gstNumber || lead.gstNumber;
      lead.leadLostReason = req.body.leadLostReason !== undefined ? req.body.leadLostReason : lead.leadLostReason;
      
      if (req.body.subStatus !== undefined) {
        lead.subStatus = req.body.subStatus;
      }
      
      if (req.body.source !== undefined) lead.source = req.body.source;
      if (req.body.referredByStaff !== undefined) lead.referredByStaff = req.body.referredByStaff || null;
      if (req.body.referredByCustomer !== undefined) lead.referredByCustomer = req.body.referredByCustomer || null;

      if (req.body.personalInfo) {
        lead.personalInfo = { ...lead.personalInfo, ...req.body.personalInfo };
      }

      // Only admin can reassign leads
      if (req.user.role === 'admin') {
        lead.assignedTo = req.body.assignedTo || lead.assignedTo;
      }

      const isNewFollowUp = req.body.followUpDate && req.body.followUpDate !== lead.followUpDate?.toISOString();
      if (isNewFollowUp) {
        lead.followUpNotified = false;
      }

      const updatedLead = await lead.save();

      // Create notification for follow-up
      if (isNewFollowUp) {
        const followDate = new Date(req.body.followUpDate);
        const dateStr = followDate.toLocaleDateString('en-GB');
        const timeStr = followDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        await Notification.create({
          recipient: lead.assignedTo,
          title: 'Follow-up Scheduled',
          message: `New follow-up for ${lead.name} on ${dateStr} at ${timeStr}`,
          type: 'FollowUp',
          relatedId: lead._id
        });

        // Also notify admin if staff updated it
        if (req.user.role !== 'admin') {
          await Notification.create({
            recipient: lead.owner, // Admin who owns the system
            title: 'Staff Scheduled Follow-up',
            message: `${req.user.name} scheduled a follow-up for ${lead.name} on ${dateStr} at ${timeStr}`,
            type: 'FollowUp',
            relatedId: lead._id
          });
        }
      }

      res.json(updatedLead);
    } else {
      res.status(404).json({ message: 'Lead not found' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const logPhoneView = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (lead) {
      // Ensure we don't spam the history if they click multiple times in a short span, 
      // but simple push is okay for a start.
      lead.history.push({
        status: lead.status, // Keep current status
        comment: "Viewed lead's contact number",
        updatedBy: req.user._id,
      });
      const updatedLead = await lead.save();

      // Notify admin
      if (req.user.role !== 'admin') {
        const dateStr = new Date().toLocaleDateString('en-GB');
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        await Notification.create({
          recipient: lead.owner, // Admin who owns the system
          title: 'Contact Number Viewed',
          message: `${req.user.name} viewed contact number for lead ${lead.name} on ${dateStr} at ${timeStr}`,
          type: 'LeadUpdate',
          relatedId: lead._id
        });
      }

      res.json(updatedLead);
    } else {
      res.status(404).json({ message: 'Lead not found' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = { 
  createLead, 
  getLeads, 
  updateLead, 
  logPhoneView,
  createPublicReferral,
  handleGoogleFormWebhook
};
