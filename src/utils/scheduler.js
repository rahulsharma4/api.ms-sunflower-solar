const Lead = require('../models/leadModel');
const Contact = require('../models/contactModel');
const Notification = require('../models/notificationModel');

const startReminderScheduler = () => {
  // Run every 30 seconds
  setInterval(async () => {
    try {
      const now = new Date();
      const checkWindow = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes from now

      // 1. Check Leads for follow-up reminders
      // We want pending follow-ups that are scheduled for <= 15 minutes from now
      // and haven't been notified yet.
      const upcomingLeads = await Lead.find({
        followUpDate: { $lte: checkWindow, $gt: new Date(now.getTime() - 24 * 60 * 60 * 1000) }, // within next 15 mins (and not older than 1 day to avoid old missed ones re-triggering)
        followUpStatus: 'Pending',
        followUpNotified: { $ne: true }
      });

      for (const lead of upcomingLeads) {
        const timeStr = new Date(lead.followUpDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        // Notify Staff (assignedTo)
        if (lead.assignedTo) {
          await Notification.create({
            recipient: lead.assignedTo,
            title: 'Upcoming Follow-up Reminder',
            message: `Reminder: Follow-up with ${lead.name} scheduled today at ${timeStr}`,
            type: 'FollowUp',
            relatedId: lead._id
          });
        }

        // Notify Admin (owner)
        if (lead.owner && (!lead.assignedTo || lead.owner.toString() !== lead.assignedTo.toString())) {
          await Notification.create({
            recipient: lead.owner,
            title: 'Upcoming Follow-up Reminder (Staff)',
            message: `Reminder: Staff follow-up with ${lead.name} scheduled today at ${timeStr}`,
            type: 'FollowUp',
            relatedId: lead._id
          });
        }

        // Mark as notified
        lead.followUpNotified = true;
        await lead.save();
      }

      // 2. Check Contacts for callback reminders
      // We want callbacks that are scheduled for <= 15 minutes from now
      // and haven't been notified yet.
      const upcomingContacts = await Contact.find({
        status: 'Call Back',
        callBackDate: { $lte: checkWindow, $gt: new Date(now.getTime() - 24 * 60 * 60 * 1000) }, // within next 15 mins (and not older than 1 day)
        callBackNotified: { $ne: true }
      });

      for (const contact of upcomingContacts) {
        const timeStr = new Date(contact.callBackDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Notify Telecaller (assignedTo)
        if (contact.assignedTo) {
          await Notification.create({
            recipient: contact.assignedTo,
            title: 'Upcoming Callback Reminder',
            message: `Reminder: Callback with ${contact.name} scheduled today at ${timeStr}`,
            type: 'FollowUp',
            relatedId: contact._id
          });
        }

        // Notify Admin (owner)
        if (contact.owner && (!contact.assignedTo || contact.owner.toString() !== contact.assignedTo.toString())) {
          await Notification.create({
            recipient: contact.owner,
            title: 'Upcoming Callback Reminder (Telecaller)',
            message: `Reminder: Telecaller callback with ${contact.name} scheduled today at ${timeStr}`,
            type: 'FollowUp',
            relatedId: contact._id
          });
        }

        // Mark as notified
        contact.callBackNotified = true;
        await contact.save();
      }

    } catch (error) {
      console.error('Error in reminder scheduler:', error);
    }
  }, 30000); // Check every 30 seconds
};

module.exports = { startReminderScheduler };
