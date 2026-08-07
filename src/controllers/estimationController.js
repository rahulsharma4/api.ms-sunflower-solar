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

// @desc    Update estimation
// @route   PUT /api/estimations/:id
// @access  Private/Admin
const updateEstimation = async (req, res) => {
  try {
    const { customerName, customerId, customerType, items, notes, status } = req.body;
    const estimation = await Estimation.findById(req.params.id);

    if (!estimation) {
      return res.status(404).json({ message: 'Estimation not found' });
    }

    const oldStatus = estimation.status;
    const newStatus = status || oldStatus;

    // We will perform inventory adjustments based on status transitions and item updates
    if (oldStatus === 'Draft' || oldStatus === 'Cancelled') {
      if (newStatus === 'Finalized') {
        // Deduct new items from inventory
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
    } else if (oldStatus === 'Finalized') {
      if (newStatus === 'Draft' || newStatus === 'Cancelled') {
        // Restore old items to inventory
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
      } else if (newStatus === 'Finalized') {
        // Both old and new are Finalized - adjust based on differences
        const oldItemsMap = new Map();
        estimation.items.forEach(item => {
          oldItemsMap.set(item.product.toString(), item.quantity);
        });

        const newItemsMap = new Map();
        items.forEach(item => {
          newItemsMap.set(item.product.toString(), item.quantity);
        });

        // 1. Process items in old list
        for (const oldItem of estimation.items) {
          const prodIdStr = oldItem.product.toString();
          if (newItemsMap.has(prodIdStr)) {
            const newQty = newItemsMap.get(prodIdStr);
            const diff = newQty - oldItem.quantity;
            if (diff !== 0) {
              await Inventory.findByIdAndUpdate(oldItem.product, {
                $inc: { quantity: -diff },
                $push: {
                  history: {
                    action: 'ESTIMATION_UPDATED',
                    quantityChange: -diff,
                    remark: `Quantity adjusted in Estimation for ${customerName}`
                  }
                }
              });
            }
          } else {
            // Item removed, restore its quantity
            await Inventory.findByIdAndUpdate(oldItem.product, {
              $inc: { quantity: oldItem.quantity },
              $push: {
                history: {
                  action: 'ESTIMATION_UPDATED',
                  quantityChange: oldItem.quantity,
                  remark: `Item removed from Estimation for ${customerName}, stock restored`
                }
              }
            });
          }
        }

        // 2. Process items only in new list (added items)
        for (const newItem of items) {
          const prodIdStr = newItem.product.toString();
          if (!oldItemsMap.has(prodIdStr)) {
            await Inventory.findByIdAndUpdate(newItem.product, {
              $inc: { quantity: -newItem.quantity },
              $push: {
                history: {
                  action: 'ESTIMATION_UPDATED',
                  quantityChange: -newItem.quantity,
                  remark: `New item added in Estimation for ${customerName}, stock deducted`
                }
              }
            });
          }
        }
      }
    }

    // Recalculate total amount
    let totalAmount = 0;
    for (const item of items) {
      totalAmount += (item.quantity * item.price);
    }

    estimation.customerName = customerName || estimation.customerName;
    estimation.customerId = customerId || estimation.customerId;
    estimation.customerType = customerType || estimation.customerType;
    estimation.items = items || estimation.items;
    estimation.notes = notes !== undefined ? notes : estimation.notes;
    estimation.status = newStatus;
    estimation.totalAmount = totalAmount;

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
  updateEstimation,
  updateEstimationStatus,
  deleteEstimation,
};
