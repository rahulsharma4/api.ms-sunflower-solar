const Payment = require('../models/paymentModel');
const Lead = require('../models/leadModel');
const Quotation = require('../models/quotationModel');

// @desc    Add a payment for a lead
// @route   POST /api/payments
// @access  Private
const addPayment = async (req, res) => {
  const { leadId, amount, paymentDate, paymentMode, paymentType, remarks, referenceNo, bankName, chequeDate } = req.body;

  try {
    const lead = await Lead.findById(leadId);
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    // Check if staff is authorized for this lead
    if (req.user.role !== 'admin' && lead.assignedTo.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized to add payment for this lead' });
    }

    const payment = await Payment.create({
      leadId,
      amount,
      paymentDate,
      paymentMode,
      paymentType,
      referenceNo,
      bankName,
      chequeDate,
      remarks,
      addedBy: req.user._id,
      owner: req.user.role === 'admin' ? req.user._id : req.user.owner,
    });

    // Update Lead status if it's a Booking Amount
    if (paymentType === 'Booking Amount') {
      await Lead.findByIdAndUpdate(leadId, { status: 'Booked' });
    }

    // Assign Order ID to the latest quotation for this lead if it doesn't have one
    const latestQuotation = await Quotation.findOne({ lead: leadId }).sort({ createdAt: -1 });
    if (latestQuotation) {
      let shouldSaveQuotation = false;

      if (!latestQuotation.orderId) {
        // Find the highest orderId starting with SSE1/2/
        const lastOrder = await Quotation.findOne({
          orderId: new RegExp('^SSE1/2/')
        }).sort({ orderId: -1 });

        let nextNumber = 1;
        if (lastOrder && lastOrder.orderId) {
          const parts = lastOrder.orderId.split('/');
          const lastNoStr = parts[2];
          const lastNo = parseInt(lastNoStr, 10);
          if (!isNaN(lastNo)) {
            nextNumber = lastNo + 1;
          }
        }
        
        const newOrderId = `SSE1/2/${nextNumber.toString().padStart(3, '0')}/`;
        latestQuotation.orderId = newOrderId;
        shouldSaveQuotation = true;
      }

      // Automation: Update fulfillment status to "Advance received" if payment is made
      if (latestQuotation.fulfillmentStatus === 'Quotation Created') {
        latestQuotation.fulfillmentStatus = 'Advance received';
        
        // Add to history
        latestQuotation.fulfillmentHistory.push({
          status: 'Advance received',
          comment: `Automated: ${paymentType} of ₹${amount} received.`,
          date: paymentDate || new Date(),
          updatedBy: req.user._id
        });
        
        shouldSaveQuotation = true;
      }

      if (shouldSaveQuotation) {
        await latestQuotation.save();
      }
    }

    res.status(201).json(payment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get payments (Admin: all, Staff: assigned leads only)
// @route   GET /api/payments
// @access  Private
const getPayments = async (req, res) => {
  try {
    let query = { owner: req.user.role === 'admin' ? req.user._id : req.user.owner };

    if (req.user.role !== 'admin') {
      // Find leads assigned to this staff
      const leads = await Lead.find({ assignedTo: req.user._id }).select('_id');
      const leadIds = leads.map(l => l._id);
      query.leadId = { $in: leadIds };
    }

    const payments = await Payment.find(query)
      .populate('leadId', 'name phone email address quotationAmount')
      .populate('addedBy', 'name');
    
    res.json(payments);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update a payment
// @route   PUT /api/payments/:id
// @access  Private/Admin
const updatePayment = async (req, res) => {
  const { amount, paymentDate, paymentMode, paymentType, remarks, referenceNo, bankName, chequeDate } = req.body;

  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    payment.amount = amount !== undefined ? Number(amount) : payment.amount;
    payment.paymentDate = paymentDate || payment.paymentDate;
    payment.paymentMode = paymentMode || payment.paymentMode;
    payment.paymentType = paymentType || payment.paymentType;
    payment.remarks = remarks !== undefined ? remarks : payment.remarks;
    payment.referenceNo = referenceNo !== undefined ? referenceNo : payment.referenceNo;
    payment.bankName = bankName !== undefined ? bankName : payment.bankName;
    payment.chequeDate = chequeDate !== undefined ? chequeDate : payment.chequeDate;

    const updatedPayment = await payment.save();

    res.json(updatedPayment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete a payment
// @route   DELETE /api/payments/:id
// @access  Private/Admin
const deletePayment = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    await payment.deleteOne();
    res.json({ message: 'Payment deleted successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = { addPayment, getPayments, updatePayment, deletePayment };
