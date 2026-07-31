const Estimation = require('../models/estimationModel');
const Inventory = require('../models/inventoryModel');

// @desc    Get all estimations
// @route   GET /api/estimations
// @access  Private
const getEstimations = async (req, res) => {
  try {
    let query = {};
    if (req.user.role !== 'admin') {
      query.createdBy = req.user._id;
    }
    const estimations = await Estimation.find(query).populate('items.product').populate('createdBy', 'name').sort({ createdAt: -1 });
    res.status(200).json(estimations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single estimation
// @route   GET /api/estimations/:id
// @access  Private
const getEstimation = async (req, res) => {
  try {
    const estimation = await Estimation.findById(req.params.id).populate('items.product').populate('createdBy', 'name');
    if (!estimation) {
      return res.status(404).json({ message: 'Estimation not found' });
    }
    res.status(200).json(estimation);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create new estimation
// @route   POST /api/estimations
// @access  Private
const createEstimation = async (req, res) => {
  try {
    const { customerName, customerId, customerType, items, notes, status } = req.body;
    
    // Calculate total amount
    let totalAmount = 0;
    for (const item of items) {
      totalAmount += (item.quantity * item.price);
    }

    const estimationData = {
      customerName,
      customerId,
      customerType,
      items,
      notes,
      status: status || 'Draft',
      totalAmount,
      createdBy: req.user._id
    };

    const estimation = await Estimation.create(estimationData);

    // If Finalized, deduct from inventory
    if (estimation.status === 'Finalized') {
      for (const item of items) {
        await Inventory.findByIdAndUpdate(item.product, {
          $inc: { quantity: -item.quantity },
          $push: {
            history: {
              action: 'ESTIMATION_FINALIZED',
              quantityChange: -item.quantity,
              remark: `Used in Estimation for ${customerName}`
            }
          }
        });
      }
    }

    res.status(201).json(estimation);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update estimation status
// @route   PATCH /api/estimations/:id/status
// @access  Private
const updateEstimationStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const estimation = await Estimation.findById(req.params.id);

    if (!estimation) {
      return res.status(404).json({ message: 'Estimation not found' });
    }

    if (estimation.status === 'Draft' && status === 'Finalized') {
      // Deduct from inventory
      for (const item of estimation.items) {
        await Inventory.findByIdAndUpdate(item.product, {
          $inc: { quantity: -item.quantity },
          $push: {
            history: {
              action: 'ESTIMATION_FINALIZED',
              quantityChange: -item.quantity,
              remark: `Used in Estimation for ${estimation.customerName}`
            }
          }
        });
      }
    } else if (estimation.status === 'Finalized' && status === 'Cancelled') {
      // Restore inventory
      for (const item of estimation.items) {
        await Inventory.findByIdAndUpdate(item.product, {
          $inc: { quantity: item.quantity },
          $push: {
            history: {
              action: 'ESTIMATION_CANCELLED',
              quantityChange: item.quantity,
              remark: `Restored from Cancelled Estimation for ${estimation.customerName}`
            }
          }
        });
      }
    }

    estimation.status = status;
    await estimation.save();

    res.status(200).json(estimation);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete estimation
// @route   DELETE /api/estimations/:id
// @access  Private/Admin
const deleteEstimation = async (req, res) => {
  try {
    const estimation = await Estimation.findById(req.params.id);
    if (!estimation) {
      return res.status(404).json({ message: 'Estimation not found' });
    }

    if (estimation.status === 'Finalized') {
       // Restore inventory before deleting
       for (const item of estimation.items) {
         await Inventory.findByIdAndUpdate(item.product, {
           $inc: { quantity: item.quantity },
           $push: {
             history: {
               action: 'ESTIMATION_DELETED',
               quantityChange: item.quantity,
               remark: `Restored from Deleted Estimation for ${estimation.customerName}`
             }
           }
         });
       }
    }

    await estimation.deleteOne();
    res.status(200).json({ message: 'Estimation deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getEstimations,
  getEstimation,
  createEstimation,
  updateEstimationStatus,
  deleteEstimation,
};
