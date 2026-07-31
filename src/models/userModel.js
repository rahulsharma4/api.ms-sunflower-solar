const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    phone: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      required: true,
      enum: ['admin', 'staff', 'telecaller'],
      default: 'staff',
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    status: {
      type: String,
      required: true,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    tokenVersion: {
      type: Number,
      required: true,
      default: 0,
    },
    companyDetails: {
      fbPageId: { type: String, default: '' },
      fbPageAccessToken: { type: String, default: '' },
      fbPageName: { type: String, default: '' },
      fbAccessToken: { type: String, default: '' },
    },
  },
  {
    timestamps: true,
  }
);

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Encrypt password using bcrypt
userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }

  try {
    // Using 8 rounds for a balance between security and speed on all systems
    this.password = await bcrypt.hash(this.password, 8);
  } catch (error) {
    throw error;
  }
});

const User = mongoose.model('User', userSchema);

module.exports = User;
