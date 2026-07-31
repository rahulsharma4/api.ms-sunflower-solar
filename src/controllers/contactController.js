const Contact = require('../models/contactModel');
const mongoose = require('mongoose');

// @desc    Get all contacts (Admin gets all owned, telecaller gets assigned)
// @route   GET /api/contacts
// @access  Private
const getContacts = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;

    let query = {};
    if (req.user.role !== 'admin') {
      query.assignedTo = req.user._id;
    }

    // Filters from req.query
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      query.$or = [
        { name: searchRegex },
        { phone: searchRegex },
        { address: searchRegex }
      ];
    }

    if (req.query.telecallerSearchTerm) {
      const User = require('../models/userModel');
      const telecallers = await User.find({ name: new RegExp(req.query.telecallerSearchTerm, 'i'), role: 'telecaller' }).select('_id');
      const telecallerIds = telecallers.map(t => t._id);
      if (!query.assignedTo) {
         query.assignedTo = { $in: telecallerIds };
      }
    }

    if (req.query.status && req.query.status !== 'All') {
      query.callingStatus = req.query.status;
    }
    if (req.query.subStatus && req.query.subStatus !== 'All') {
      query.subStatus = req.query.subStatus;
    }
    if (req.query.assignment && req.query.assignment !== 'All') {
      if (req.query.assignment === 'Assigned') query.assignedTo = { $ne: null };
      if (req.query.assignment === 'Unassigned') query.assignedTo = null;
    }
    if (req.query.monthlyBill && req.query.monthlyBill !== 'All') {
      query.monthlyBill = req.query.monthlyBill;
    }
    if (req.query.source && req.query.source !== 'All') {
      if (req.query.source === 'Digital') {
         query.source = { $regex: /digital|facebook|instagram|google|website|fb/i };
      } else if (req.query.source === 'Website' || req.query.source === 'Website Form') {
         query.source = { $regex: /website|digital/i };
      } else {
         query.source = req.query.source;
      }
    }
    if (req.query.fromDate || req.query.toDate) {
      query.createdAt = {};
      if (req.query.fromDate) query.createdAt.$gte = new Date(req.query.fromDate);
      if (req.query.toDate) {
        const toDate = new Date(req.query.toDate);
        toDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = toDate;
      }
      // Cleanup if empty
      if (Object.keys(query.createdAt).length === 0) delete query.createdAt;
    }

    // Sorting (show most recently updated or created first)
    let sortObj = { updatedAt: -1, createdAt: -1 };
    if (req.query.sortBy) {
      sortObj = { [req.query.sortBy]: req.query.sortDir === 'asc' ? 1 : -1 };
    }

    // Optional override to fetch all (for export, auto-assign, etc)
    const fetchAll = req.query.fetchAll === 'true';

    const totalContacts = await Contact.countDocuments(query);
    
    let contactsQuery = Contact.find(query)
      .populate('assignedTo', 'name email phone role')
      .populate('createdBy', 'name role')
      .populate('updatedBy', 'name role')
      .populate('referredByStaff', 'name')
      .populate('referredByCustomer', 'name phone')
      .sort(sortObj);

    if (!fetchAll) {
      contactsQuery = contactsQuery.skip(skip).limit(limit);
    }

    const contacts = await contactsQuery.lean();

    // Fetch corresponding leads to attach leadId for converted contacts
    const Lead = require('../models/leadModel');
    const contactPhones = contacts.map(c => c.phone);
    
    // Find leads with matching phones
    const leads = await Lead.find({ phone: { $in: contactPhones } }).select('phone leadId');
    const leadMap = {};
    leads.forEach(l => {
      leadMap[l.phone] = l.leadId;
    });

    // Attach leadId to contacts
    const contactsWithLeadId = contacts.map(contact => ({
      ...contact,
      leadId: leadMap[contact.phone] || null
    }));

    if (fetchAll) {
      res.json(contactsWithLeadId);
    } else {
      res.json({
        contacts: contactsWithLeadId,
        totalContacts,
        totalPages: Math.ceil(totalContacts / limit),
        currentPage: page
      });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a single contact
// @route   POST /api/contacts
// @access  Private/Admin
const createContact = async (req, res) => {
  try {
    const { name, phone, address, monthlyBill, status, callingStatus, subStatus, remarks, source, referredByStaff, referredByCustomer, paymentMode } = req.body;
    
    // Check for duplicate phone
    if (phone) {
      const existingContact = await Contact.findOne({ phone: String(phone).trim() });
      if (existingContact) {
        return res.status(400).json({ message: 'A contact with this phone number already exists.' });
      }
    }

    const initialStatus = status || 'New';
    const initialRemarks = remarks || '';
    const contact = new Contact({
      name,
      phone,
      address,
      monthlyBill: monthlyBill || '0-1000',
      status: initialStatus,
      callingStatus: callingStatus || '',
      subStatus: subStatus || '',
      remarks: initialRemarks,
      source: source || 'Direct',
      referredByStaff: referredByStaff || null,
      referredByCustomer: referredByCustomer || null,
      paymentMode: paymentMode || 'Direct',
      createdBy: req.user._id,
      owner: req.user._id,
      statusHistory: [
        {
          status: initialStatus,
          remarks: initialRemarks,
          updatedBy: req.user._id,
          updatedAt: new Date()
        }
      ]
    });
    const createdContact = await contact.save();
    const populatedContact = await Contact.findById(createdContact._id)
      .populate('createdBy', 'name role')
      .populate('updatedBy', 'name role')
      .populate('referredByStaff', 'name')
      .populate('referredByCustomer', 'name phone')
      .populate('statusHistory.updatedBy', 'name role');
    res.status(201).json(populatedContact);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Bulk create contacts from list
// @route   POST /api/contacts/bulk
// @access  Private/Admin
const bulkCreateContacts = async (req, res) => {
  try {
    const contactsList = Array.isArray(req.body) ? req.body : req.body.contacts;
    if (!contactsList || !Array.isArray(contactsList)) {
      return res.status(400).json({ message: 'Invalid data format. Expected an array.' });
    }

    const formattedContacts = contactsList.map((c) => {
      const initialStatus = c.status || 'New';
      const initialRemarks = c.remarks || '';
      return {
        name: c.name,
        phone: c.phone ? String(c.phone) : '',
        address: c.address || '',
        monthlyBill: c.monthlyBill || '0-1000',
        status: initialStatus,
        callingStatus: c.callingStatus || '',
        subStatus: c.subStatus || '',
        remarks: initialRemarks,
        createdBy: req.user._id,
        owner: req.user._id,
        statusHistory: [
          {
            status: initialStatus,
            remarks: initialRemarks,
            updatedBy: req.user._id,
            updatedAt: new Date()
          }
        ]
      };
    });

    try {
      // Filter out duplicate phones from the list itself
      const uniqueContactsList = [];
      const uniquePhones = new Set();
      for (const c of formattedContacts) {
        if (c.phone) {
          if (!uniquePhones.has(c.phone)) {
            uniquePhones.add(c.phone);
            uniqueContactsList.push(c);
          }
        } else {
          uniqueContactsList.push(c);
        }
      }

      // Filter out duplicates that already exist in DB
      const existingPhones = await Contact.find({ phone: { $in: Array.from(uniquePhones) } }).select('phone');
      const existingPhoneSet = new Set(existingPhones.map(c => c.phone));
      
      const finalContactsToInsert = uniqueContactsList.filter(c => !c.phone || !existingPhoneSet.has(c.phone));

      if (finalContactsToInsert.length === 0) {
        return res.status(400).json({ message: 'All contacts in the file are duplicates. No new contacts added.' });
      }

      const createdContacts = await Contact.insertMany(finalContactsToInsert, { ordered: false });
      
      if (finalContactsToInsert.length < formattedContacts.length) {
        return res.status(201).json({
          message: `Inserted ${finalContactsToInsert.length} contacts successfully. Skipped ${formattedContacts.length - finalContactsToInsert.length} duplicates.`,
          createdContacts
        });
      }

      res.status(201).json(createdContacts);
    } catch (insertError) {
      if (insertError.name === 'BulkWriteError' && insertError.insertedDocs) {
        return res.status(201).json({
          message: `Inserted ${insertError.insertedDocs.length} out of ${formattedContacts.length} contacts successfully. Some failed validation or were duplicates.`,
          createdContacts: insertError.insertedDocs
        });
      }
      throw insertError;
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete a contact
// @route   DELETE /api/contacts/:id
// @access  Private/Admin
const deleteContact = async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (contact) {
      if (req.user.role !== 'admin' && contact.owner.toString() !== req.user._id.toString()) {
        return res.status(401).json({ message: 'Not authorized to delete this contact' });
      }
      await contact.deleteOne();
      res.json({ message: 'Contact removed successfully' });
    } else {
      res.status(404).json({ message: 'Contact not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Bulk delete contacts
// @route   DELETE /api/contacts/bulk
// @access  Private/Admin
const bulkDeleteContacts = async (req, res) => {
  try {
    const { contactIds } = req.body;
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ message: 'No contacts selected for deletion' });
    }

    // Delete contacts
    await Contact.deleteMany({
      _id: { $in: contactIds }
    });

    res.json({ message: 'Contacts deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Assign multiple contacts to a telecaller
// @route   PATCH /api/contacts/assign
// @access  Private/Admin
const assignContacts = async (req, res) => {
  try {
    const { contactIds, assignedTo } = req.body;
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ message: 'No contacts selected' });
    }

    if (assignedTo) {
      const User = require('../models/userModel');
      const telecaller = await User.findOne({ _id: assignedTo, role: 'telecaller', isDeleted: { $ne: true } });
      if (!telecaller) {
        return res.status(400).json({ message: 'Invalid telecaller selected' });
      }
    }

    // Allow reassignment of contacts directly

    const updateData = { assignedTo: assignedTo || null };
    await Contact.updateMany(
      { _id: { $in: contactIds } },
      { $set: updateData }
    );
    res.json({ message: 'Contacts assigned successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Convert contact to a Lead
// @route   POST /api/contacts/:id/convert
// @access  Private
const convertContactToLead = async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    // Authorize: Admin or assigned Telecaller
    if (req.user.role !== 'admin' && (!contact.assignedTo || contact.assignedTo.toString() !== req.user._id.toString())) {
      return res.status(401).json({ message: 'Not authorized to convert this contact' });
    }

    if (contact.status === 'Converted') {
      return res.status(400).json({ message: 'Contact is already converted to a lead' });
    }

    const Lead = require('../models/leadModel');
    const { 
      solarCapacity, roofType, propertyType, remarks, name, phone, address,
      monthlyBill, email, quotationAmount, technicalRemarks, companyName, companyAddress, gstNumber,
      personalInfo, source, referredByStaff, referredByCustomer, paymentMode, assignedTo
    } = req.body;

    const lead = new Lead({
      name: name || contact.name,
      phone: phone || contact.phone,
      address: address || contact.address,
      monthlyBill: monthlyBill || contact.monthlyBill || '0-1000',
      email: email || undefined,
      solarCapacity: solarCapacity || '',
      roofType: roofType || '',
      propertyType: propertyType || '',
      quotationAmount: quotationAmount || 0,
      technicalRemarks: technicalRemarks || '',
      companyName: companyName || '',
      companyAddress: companyAddress || '',
      gstNumber: gstNumber || '',
      personalInfo: personalInfo || {},
      source: source || contact.source || 'Telecalling',
      referredByStaff: referredByStaff || contact.referredByStaff || null,
      referredByCustomer: referredByCustomer || contact.referredByCustomer || null,
      paymentMode: paymentMode || contact.paymentMode || 'Direct',
      assignedTo: assignedTo || null, // initially unassigned unless explicitly passed
      createdBy: req.user._id,
      owner: req.user.role === 'admin' ? req.user._id : req.user.owner,
      history: [
        {
          status: 'New',
          comment: remarks || 'Lead created via Telecalling conversion',
          updatedBy: req.user._id,
        }
      ]
    });

    const createdLead = await lead.save();

    contact.status = 'Converted';
    if (remarks) {
      contact.remarks = remarks;
    }
    contact.updatedBy = req.user._id;
    contact.statusHistory.push({
      status: 'Converted',
      remarks: remarks || 'Converted to Lead',
      updatedBy: req.user._id,
      updatedAt: new Date()
    });
    await contact.save();

    res.status(201).json({
      message: 'Contact converted to Lead successfully',
      lead: createdLead,
      contact
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update a contact's status and remarks
// @route   PATCH /api/contacts/:id
// @access  Private
const updateContact = async (req, res) => {
  try {
    const { status, callingStatus, subStatus, remarks, callBackDate, source, referredByStaff, referredByCustomer, paymentMode } = req.body;
    const contact = await Contact.findById(req.params.id);

    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    // Authorize: Admin or assigned Telecaller
    if (req.user.role !== 'admin' && (!contact.assignedTo || contact.assignedTo.toString() !== req.user._id.toString())) {
      return res.status(401).json({ message: 'Not authorized to update this contact' });
    }

    let isNewCallBack = false;
    if (status) {
      const validStatuses = ['New', 'No Answer', 'Call Back', 'Interested', 'Not Interested', 'Converted'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: 'Invalid contact status' });
      }
      contact.status = status;
      if (status !== 'Call Back') {
        contact.callBackDate = null;
        contact.callBackNotified = false;
      }
    }

    if (callBackDate !== undefined) {
      const newDate = callBackDate ? new Date(callBackDate) : null;
      const oldDateStr = contact.callBackDate ? new Date(contact.callBackDate).toISOString() : null;
      const newDateStr = newDate ? newDate.toISOString() : null;

      if (newDateStr !== oldDateStr) {
        contact.callBackDate = newDate;
        contact.callBackNotified = false;
        isNewCallBack = !!newDate;
      }
    }

    if (remarks !== undefined) {
      contact.remarks = remarks;
    }

    if (callingStatus !== undefined) {
      contact.callingStatus = callingStatus;
    }

    if (subStatus !== undefined) {
      contact.subStatus = subStatus;
    }
    
    if (source !== undefined) contact.source = source;
    if (referredByStaff !== undefined) contact.referredByStaff = referredByStaff || null;
    if (referredByCustomer !== undefined) contact.referredByCustomer = referredByCustomer || null;
    if (paymentMode !== undefined) contact.paymentMode = paymentMode || 'Direct';

    contact.updatedBy = req.user._id;

    // Log update into statusHistory
    contact.statusHistory.push({
      status: contact.status,
      remarks: contact.remarks,
      callBackDate: contact.callBackDate,
      updatedBy: req.user._id,
      updatedAt: new Date()
    });

    await contact.save();

    const populatedContact = await Contact.findById(contact._id)
      .populate('assignedTo', 'name email phone role')
      .populate('createdBy', 'name role')
      .populate('updatedBy', 'name role')
      .populate('referredByStaff', 'name')
      .populate('referredByCustomer', 'name phone')
      .populate('statusHistory.updatedBy', 'name role');

    // Create notification if a new callback is scheduled
    if (isNewCallBack && contact.callBackDate) {
      const Notification = require('../models/notificationModel');
      const followDate = new Date(contact.callBackDate);
      const dateStr = followDate.toLocaleDateString('en-GB');
      const timeStr = followDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Notify the assigned telecaller (if assigned)
      if (contact.assignedTo) {
        await Notification.create({
          recipient: contact.assignedTo,
          title: 'Callback Scheduled',
          message: `New callback scheduled for ${contact.name} on ${dateStr} at ${timeStr}`,
          type: 'FollowUp',
          relatedId: contact._id
        });
      }

      // Also notify admin if someone else updated it
      if (req.user.role !== 'admin') {
        await Notification.create({
          recipient: contact.owner, // Admin who owns the system
          title: 'Telecaller Scheduled Callback',
          message: `${req.user.name} scheduled a callback for ${contact.name} on ${dateStr} at ${timeStr}`,
          type: 'FollowUp',
          relatedId: contact._id
        });
      }
    }

    res.json(populatedContact);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get single contact details
// @route   GET /api/contacts/:id
// @access  Private
const getContactDetails = async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id)
      .populate('assignedTo', 'name email phone role')
      .populate('createdBy', 'name role')
      .populate('updatedBy', 'name role')
      .populate('referredByStaff', 'name')
      .populate('referredByCustomer', 'name phone')
      .populate('statusHistory.updatedBy', 'name role');

    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    // Authorize: Admin or assigned Telecaller
    if (req.user.role !== 'admin' && (!contact.assignedTo || contact.assignedTo._id.toString() !== req.user._id.toString())) {
      return res.status(401).json({ message: 'Not authorized to view this contact' });
    }

    // Dynamic fallback for older contacts that don't have statusHistory
    const contactObj = contact.toObject();
    if (!contactObj.statusHistory || contactObj.statusHistory.length === 0) {
      contactObj.statusHistory = [
        {
          _id: new mongoose.Types.ObjectId(),
          status: contactObj.status,
          remarks: contactObj.remarks || 'No initial remarks recorded',
          callBackDate: contactObj.callBackDate,
          updatedBy: contactObj.createdBy || contactObj.owner,
          updatedAt: contactObj.createdAt
        }
      ];
    }

    if (contactObj.status === 'Converted') {
      const Lead = require('../models/leadModel');
      const lead = await Lead.findOne({ phone: contactObj.phone }).populate('history.updatedBy', 'name role');
      if (lead && lead.history && lead.history.length > 0) {
        const leadHistoryFormatted = lead.history.map(lh => ({
          _id: lh._id,
          status: lh.status,
          remarks: lh.comment || '',
          updatedBy: lh.updatedBy,
          updatedAt: lh.updatedAt
        }));
        // Avoid duplicate "Converted" / "New" entries if they happened at the exact same time, 
        // but simple concatenation is fine as it shows the progression.
        contactObj.statusHistory = [...contactObj.statusHistory, ...leadHistoryFormatted];
      }
    }

    res.json(contactObj);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Handle incoming webhook from Google Forms
// @route   POST /api/contacts/google-form-webhook
// @access  Public
const handleGoogleFormWebhook = async (req, res) => {
  try {
    const formData = req.body;
    
    // We expect generic key-value pairs from Google Form like:
    // { "Name": "John Doe", "Phone Number": "1234567890", "Email": "a@b.com", "Address": "..." }
    
    // Try to guess which field maps to which
    let name = 'Unknown';
    let phone = 'Unknown';
    let email = '';
    let address = '';
    let remarks = 'Source: Google Form\n';

    for (const [key, value] of Object.entries(formData)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('name')) name = value;
      else if (lowerKey.includes('phone') || lowerKey.includes('mobile') || lowerKey.includes('contact')) phone = value;
      else if (lowerKey.includes('email') || lowerKey.includes('mail')) email = value;
      else if (lowerKey.includes('address') || lowerKey.includes('location') || lowerKey.includes('city')) address = value;
      else {
        remarks += `${key}: ${value}\n`;
      }
    }

    // Default owner (could be first admin found)
    const User = require('../models/userModel');
    let admin = await User.findOne({ role: 'admin', email: process.env.ADMIN_EMAIL });
    if (!admin) {
      admin = await User.findOne({ role: 'admin', isDeleted: { $ne: true }, status: { $ne: 'inactive' } }).sort({ createdAt: -1 });
    }
    if (!admin) {
      admin = await User.findOne({ role: 'admin' });
    }
    const ownerId = admin ? admin._id : null;

    if (!ownerId) {
      return res.status(500).json({ message: 'No admin found to assign this lead to' });
    }

    const contact = await Contact.create({
      name,
      phone,
      email,
      address,
      status: 'Open(Not Assigned Yet)',
      source: 'Digital',
      remarks,
      owner: ownerId,
      createdBy: ownerId
    });

    res.status(201).json({ message: 'Success', contact });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ message: error.message });
  }
};

const handleWebsiteWebhook = async (req, res) => {
  try {
    const formData = req.body || {};
    
    // Support all possible field name variations from forms/webhooks
    let name = formData.fullName || formData.name || formData.full_name || formData.clientName || formData.userName || 'Unknown Website Lead';
    let rawPhone = formData.whatsappNumber || formData.phone || formData.phoneNumber || formData.mobileNumber || formData.mobile || formData.contact || formData.contactNumber || formData.whatsapp || '';
    let email = formData.email || formData.mail || '';
    
    // Clean phone number (strip +91, spaces, hyphens)
    let phone = String(rawPhone).replace(/[^0-9]/g, '');
    if (phone.length > 10 && phone.startsWith('91')) {
      phone = phone.slice(-10);
    }
    if (phone.length > 10 && phone.startsWith('0')) {
      phone = phone.slice(-10);
    }

    let pinCode = formData.pinCode || formData.pincode || formData.zipCode || formData.zip || formData.pin || '';
    let address = pinCode ? `Pincode: ${pinCode}` : (formData.address || formData.city || 'Website Lead');
    
    let remarks = `Source: Company Website\nType: ${formData.type || formData.projectType || 'Residential'}\n`;
    if (pinCode) {
      remarks += `Pincode: ${pinCode}\n`;
    }

    let monthlyBill = 'Below 1800 rs';
    let rawBill = formData.monthlyBill || formData.bill || formData.monthly_bill || formData.ebill || formData.electricityBill || formData['monthly-bill'] || formData['electricity-bill'] || formData['e-bill'] || formData['E-Bill'] || formData['Monthly Bill'] || formData['Electricity Bill'] || '';
    if (!rawBill) {
      for (const [key, val] of Object.entries(formData)) {
        if (val && typeof val === 'string' && (key.toLowerCase().includes('bill') || key.toLowerCase().includes('monthly') || key.toLowerCase().includes('electricity') || key.toLowerCase().includes('ebill') || key.toLowerCase().includes('cost') || key.toLowerCase().includes('spend') || key.toLowerCase().includes('बिल'))) {
          rawBill = val;
          break;
        }
      }
    }

    if (rawBill) {
      const validEnums = ['0-1000', '1001-3000', '3001-5000', '5000+', 'Below 1800 rs', '1800- 3000', '3000-5000', 'Above 5000'];
      const cleanBillStr = String(rawBill).trim();
      if (validEnums.includes(cleanBillStr)) {
        monthlyBill = cleanBillStr;
      } else {
        const normalizedBill = cleanBillStr.replace(/,/g, '');
        const lowerBill = normalizedBill.toLowerCase();
        if ((lowerBill.includes('4000') && lowerBill.includes('8000')) || lowerBill.includes('8000') || lowerBill.includes('more than') || lowerBill.includes('above') || lowerBill.includes('5000+')) {
          monthlyBill = 'Above 5000';
        } else if ((lowerBill.includes('2500') && lowerBill.includes('4000')) || lowerBill.includes('4000') || lowerBill.includes('3000-5000') || lowerBill.includes('3500')) {
          monthlyBill = '3000-5000';
        } else if ((lowerBill.includes('1500') && lowerBill.includes('2500')) || lowerBill.includes('2500') || lowerBill.includes('1800- 3000') || lowerBill.includes('2000')) {
          monthlyBill = '1800- 3000';
        } else if (lowerBill.includes('less than') || lowerBill.includes('below') || lowerBill.includes('0-1000') || lowerBill.includes('1500') || lowerBill.includes('1000')) {
          monthlyBill = 'Below 1800 rs';
        } else {
          const nums = normalizedBill.match(/\d+/g);
          if (nums && nums.length > 0) {
            const maxVal = Math.max(...nums.map(n => parseInt(n, 10)));
            if (maxVal > 5000) monthlyBill = 'Above 5000';
            else if (maxVal > 3000) monthlyBill = '3000-5000';
            else if (maxVal > 1800) monthlyBill = '1800- 3000';
            else monthlyBill = 'Below 1800 rs';
          }
        }
      }
      remarks += `Monthly Bill: ${rawBill}\n`;
    }

    if (!phone || phone.length < 10) {
       return res.status(400).json({ message: 'Valid phone number is required', received: rawPhone });
    }

    const User = require('../models/userModel');
    const Lead = require('../models/leadModel');
    let admin = await User.findOne({ role: 'admin', email: process.env.ADMIN_EMAIL });
    if (!admin) {
      admin = await User.findOne({ role: 'admin', isDeleted: { $ne: true }, status: { $ne: 'inactive' } }).sort({ createdAt: -1 });
    }
    if (!admin) {
      admin = await User.findOne({ role: 'admin' });
    }
    if (!admin) {
      admin = await User.findOne({});
    }
    const ownerId = admin ? admin._id : null;

    if (!ownerId) {
      return res.status(500).json({ message: 'No admin found to assign this lead to' });
    }

    // Check & update/create in Lead collection (LeadsPage / CRM Leads)
    try {
      const existingLead = await Lead.findOne({ phone });
      if (existingLead) {
        const newRemarks = (existingLead.technicalRemarks || '') + `\n[New Website Inquiry]: ${remarks.trim()}`;
        await Lead.updateOne(
          { _id: existingLead._id },
          {
            $set: {
              updatedAt: new Date(),
              technicalRemarks: newRemarks,
              monthlyBill: monthlyBill,
              source: 'Website',
              owner: ownerId
            },
            $push: {
              history: {
                status: existingLead.status || 'New',
                comment: `New website inquiry submitted: ${remarks.replace(/\n/g, ' ')}`,
                updatedBy: ownerId,
                updatedAt: new Date()
              }
            }
          },
          { timestamps: false }
        );
      } else {
        await Lead.create({
          name,
          email,
          phone,
          address,
          monthlyBill,
          status: 'Open(Not Assigned Yet)',
          source: 'Website',
          technicalRemarks: remarks.trim(),
          owner: ownerId,
          createdBy: ownerId,
          history: [
            {
              status: 'Open(Not Assigned Yet)',
              comment: 'Lead generated from Website Form',
              updatedBy: ownerId,
              updatedAt: new Date()
            }
          ]
        });
      }
    } catch (leadErr) {
      console.error('Error syncing website webhook to Lead collection:', leadErr);
    }

    const existingContact = await Contact.findOne({ phone });
    if (existingContact) {
        // Force update createdAt and updatedAt so it jumps to Row #1 in Overall Leads Directory
        const newRemarks = (existingContact.remarks || '') + `\n[New Website Inquiry]: ${remarks.trim()}`;
        const historyItem = {
          status: existingContact.status || 'New',
          remarks: `New website inquiry submitted: ${remarks.replace(/\n/g, ' ')}`,
          updatedBy: ownerId,
          updatedAt: new Date()
        };
        await Contact.updateOne(
          { _id: existingContact._id },
          {
            $set: {
              createdAt: new Date(),
              updatedAt: new Date(),
              remarks: newRemarks,
              monthlyBill: monthlyBill,
              source: 'Website',
              owner: ownerId
            },
            $push: {
              statusHistory: historyItem
            }
          },
          { timestamps: false }
        );
        const updatedContact = await Contact.findById(existingContact._id);
        return res.status(200).json({ message: 'Lead already exists, updated with new website inquiry', contact: updatedContact });
    }

    const contact = await Contact.create({
      name,
      email,
      phone,
      address,
      monthlyBill,
      status: 'New',
      source: 'Website',
      remarks: remarks.trim(),
      owner: ownerId,
      createdBy: ownerId,
      statusHistory: [
        {
          status: 'New',
          remarks: 'Lead generated from Website Form',
          updatedBy: ownerId,
          updatedAt: new Date()
        }
      ]
    });

    res.status(201).json({ message: 'Success', contact });
  } catch (error) {
    console.error('Website Webhook error:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getContacts,
  createContact,
  bulkCreateContacts,
  bulkDeleteContacts,
  deleteContact,
  assignContacts,
  convertContactToLead,
  updateContact,
  getContactDetails,
  handleGoogleFormWebhook,
  handleWebsiteWebhook,
};
