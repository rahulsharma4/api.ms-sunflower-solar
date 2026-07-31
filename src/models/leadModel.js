const mongoose = require('mongoose');

const leadSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
    },
    phone: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      required: true,
    },
    monthlyBill: {
      type: String,
      enum: ['0-1000', '1001-3000', '3001-5000', '5000+', 'Below 1800 rs', '1800- 3000', '3000-5000', 'Above 5000'],
      default: 'Below 1800 rs',
    },
    solarCapacity: {
      type: String, // e.g., "5kW"
    },
    roofType: {
      type: String, // e.g., "Concrete", "Tin Shade"
    },
    propertyType: {
      type: String, // e.g., "Residential", "Commercial"
    },
    companyName: { type: String },
    companyAddress: { type: String },
    gstNumber: { type: String },
    status: {
      type: String,
      required: true,
      enum: [
        'Open(Not Assigned Yet)',
        'Assigned',
        'Conversion',
        'Call Later',
        'Call Back/DNP/Call Later',
        'Meeting Schedule',
        'Meeting Postpone',
        'Meeting Done(Hot)',
        'Meeting Done(Moderate)',
        'Meeting Done(Cold)',
        'Meeting Won',
        'Follow up Call',
        'Lead Lost'
      ],
      default: 'Open(Not Assigned Yet)',
    },
    subStatus: {
      type: String,
      default: ''
    },
    leadLostReason: {
      type: String,
      enum: ['Lead Lost To competitor', 'Not interested', 'not qualified due to roof in sufficient', 'due to e-bill less than 1800', ''],
      default: ''
    },
    source: {
      type: String,
      enum: ['BTL', 'Employee Referral', 'Existing Customer Referral', 'Digital', 'Direct', 'Facebook Ads', 'Website', 'Website Form'],
      default: 'Direct',
    },
    referredByStaff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    referredByCustomer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
    },
    referrerDetails: {
      type: String
    },
    paymentMode: {
      type: String,
      enum: ['Direct', 'EMI'],
      default: 'Direct',
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    followUpDate: {
      type: Date,
    },
    followUpStatus: {
      type: String,
      enum: ['Pending', 'Completed', 'Missed'],
      default: 'Pending',
    },
    followUpNotified: {
      type: Boolean,
      default: false,
    },
    followUpRemarks: {
      type: String,
    },
    quotationAmount: {
      type: Number,
      default: 0,
    },
    technicalRemarks: {
      type: String,
    },
    history: [
      {
        status: String,
        subStatus: String,
        comment: String,
        updatedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        updatedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    personalInfo: {
      profileImage: { type: String }, // Base64 (Primary)
      additionalImages: [{ type: String }], // Array of Base64 strings
      alternatePhone: { type: String },
      whatsappNumber: { type: String },
      gender: { type: String, enum: ['Male', 'Female', 'Other'] },
      occupation: { type: String },
      dob: { type: Date },
      aadhaarNumber: { type: String },
      panNumber: { type: String },
    },
    fbLeadId: {
      type: String,
      unique: true,
      sparse: true,
    },
    leadId: {
      type: String,
      unique: true,
      sparse: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);
const { getNextSequenceValue } = require('../utils/counter');

leadSchema.pre('save', async function () {
  if (this.isNew) {
    if (!this.leadId) {
      const isReferral = this.source === 'Employee Referral' || this.source === 'Existing Customer Referral';
      if (isReferral) {
        const seq = await getNextSequenceValue('referral_counter');
        this.leadId = `RUP${seq.toString().padStart(3, '0')}`;
      } else {
        const seq = await getNextSequenceValue('lead_counter');
        this.leadId = `LUP${seq.toString().padStart(3, '0')}`;
      }
    }

    if (!this.status || this.status === 'New' || this.status === 'Open(Not Assigned Yet)') {
      if (this.assignedTo) {
        this.status = 'Assigned';
      } else {
        this.status = 'Open(Not Assigned Yet)';
      }
    }
    if (this.history.length === 0) {
      this.history.push({
        status: this.status,
        comment: 'Lead initialized',
        updatedBy: this.createdBy
      });
    }
  } else if (this.isModified('assignedTo')) {
    if (this.assignedTo) {
      if (this.status === 'Open(Not Assigned Yet)') {
        this.status = 'Assigned';
        this.history.push({
          status: 'Assigned',
          comment: 'Consultant assigned',
          updatedBy: this.updatedBy || this.createdBy
        });
      }
    } else {
      if (this.status === 'Assigned') {
        this.status = 'Open(Not Assigned Yet)';
        this.history.push({
          status: 'Open(Not Assigned Yet)',
          comment: 'Consultant unassigned',
          updatedBy: this.updatedBy || this.createdBy
        });
      }
    }
  }
});

const Lead = mongoose.model('Lead', leadSchema);

module.exports = Lead;
