const User = require('../models/userModel');
const Lead = require('../models/leadModel');
const Contact = require('../models/contactModel');

// Webhook Verification (GET /api/leads/facebook/webhook)
exports.verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.FB_WEBHOOK_VERIFY_TOKEN) {
    console.log('FB Webhook Verified successfully.');
    return res.status(200).send(challenge);
  } else {
    console.error('FB Webhook Verification failed. Token mismatch.');
    return res.sendStatus(403);
  }
};

// Webhook Event Reception (POST /api/leads/facebook/webhook)
exports.receiveWebhook = async (req, res) => {
  try {
    const body = req.body;

    if (body.object === 'page') {
      for (const entry of body.entry) {
        if (!entry.changes) continue;

        for (const change of entry.changes) {
          if (change.field === 'leadgen') {
            const leadVal = change.value;
            const leadId = leadVal.leadgen_id;
            const pageId = leadVal.page_id || entry.id;

            console.log(`Received Facebook Lead Webhook. Lead ID: ${leadId}, Page ID: ${pageId}`);

            // 1. Check if lead already ingested
            const existingLead = await Contact.findOne({ fbLeadId: leadId });
            if (existingLead) {
              console.log(`Lead ${leadId} already exists in CRM. Skipping.`);
              continue;
            }

            // 2. Locate tenant Admin who owns this Page
            const admin = await User.findOne({ 
              role: 'admin',
              'companyDetails.fbPageId': pageId 
            });

            if (!admin) {
              console.warn(`No Admin tenant registered with Facebook Page ID: ${pageId}. Lead ignored.`);
              continue;
            }

            const pageAccessToken = admin.companyDetails.fbPageAccessToken;
            if (!pageAccessToken) {
              console.warn(`Page Access Token missing for Admin: ${admin.email}. Lead ignored.`);
              continue;
            }

            // 3. Query Meta Graph API for full lead details
            try {
              const fbUrl = `https://graph.facebook.com/v19.0/${leadId}?access_token=${pageAccessToken}`;
              const fbResponse = await fetch(fbUrl);
              const fbLeadData = await fbResponse.json();

              if (fbLeadData.error) {
                console.error(`Meta API Error fetching lead ${leadId}:`, fbLeadData.error);
                continue;
              }

              // Parse field data array
              let name = 'Meta Lead';
              let email = '';
              let phone = '';
              let address = 'N/A';
              let monthlyBill = 'Below 1800 rs';
              let remarks = 'Lead from Meta Ads.\n';

              if (fbLeadData.field_data) {
                for (const field of fbLeadData.field_data) {
                  const values = field.values;
                  if (!values || values.length === 0) continue;

                  const val = values[0];
                  const lowerName = field.name.toLowerCase();
                  
                  if (lowerName === 'full_name' || lowerName === 'name' || lowerName === 'first_name') {
                    name = val;
                  } else if (lowerName === 'email') {
                    email = val;
                  } else if (lowerName === 'phone_number' || lowerName === 'phone') {
                    phone = val;
                  } else if (lowerName === 'street_address' || lowerName === 'address' || lowerName === 'city' || lowerName === 'state' || lowerName === 'zip_code' || lowerName === 'pin_code' || lowerName === 'post_code') {
                    address = address === 'N/A' ? val : `${address}, ${val}`;
                  } else {
                    // For ANY other custom questions (like E-Bill, Roof type, etc.)
                    remarks += `${field.name}: ${val}\n`;
                    
                    // Also try to aggressively guess if it's the bill to set the dropdown
                    if (lowerName.includes('bill') || lowerName.includes('monthly') || lowerName.includes('electricity') || lowerName.includes('cost') || lowerName.includes('spend') || lowerName.includes('बिल')) {
                      // We still append it to remarks above so no data is lost, but we try to map to enum if possible
                      const validEnums = ['0-1000', '1001-3000', '3001-5000', '5000+', 'Below 1800 rs', '1800- 3000', '3000-5000', 'Above 5000'];
                      if (validEnums.includes(val)) {
                        monthlyBill = val;
                      } else {
                        // Fuzzy matching for Hindi/Currency values like '₹1500 - ₹2500'
                        const numStr = val.toString().replace(/[^0-9]/g, '');
                        if (numStr) {
                          const numVal = parseInt(numStr.substring(0, 4)); // Get first number roughly
                          if (numVal < 1800) {
                            monthlyBill = 'Below 1800 rs';
                          } else if (numVal >= 1800 && numVal <= 3000) {
                            monthlyBill = '1800- 3000';
                          } else if (numVal > 3000 && numVal <= 5000) {
                            monthlyBill = '3000-5000';
                          } else if (numVal > 5000) {
                            monthlyBill = 'Above 5000';
                          }
                        }
                      }
                    }
                  }
                }
              }

              // Ensure minimal required fields
              if (!phone) {
                phone = '9999999999'; // fallback to satisfy schema
              }
              if (!address || address === 'N/A') {
                address = 'Lead via Facebook Ads';
              }

              // Check for phone duplicate to prevent multi-entries
              const existingPhoneContact = await Contact.findOne({ phone: phone });
              if (existingPhoneContact) {
                console.log(`Contact with phone ${phone} already exists. Skipping.`);
                continue;
              }

              // Create Lead in DB (Contacts / Overall Leads)
              const newLead = await Contact.create({
                name,
                email,
                phone,
                address,
                monthlyBill,
                remarks: remarks.trim(),
                source: 'Facebook Ads',
                fbLeadId: leadId,
                owner: admin._id,
                createdBy: admin._id,
                status: 'New'
              });

              console.log(`Successfully ingested Facebook Lead: ${name} (ID: ${newLead._id}) for Admin: ${admin.name}`);
            } catch (apiErr) {
              console.error(`Error querying Meta Graph API for lead ${leadId}:`, apiErr);
            }
          }
        }
      }
      return res.status(200).send('EVENT_RECEIVED');
    } else {
      return res.sendStatus(404);
    }
  } catch (err) {
    console.error('Error in Facebook Webhook receiver:', err);
    return res.status(500).send('Internal Server Error');
  }
};

// Connect Facebook Page (POST /api/auth/facebook/connect)
exports.connectFacebookPage = async (req, res) => {
  try {
    const { userAccessToken, selectedPageId } = req.body;
    if (!userAccessToken || !selectedPageId) {
      return res.status(400).json({ message: 'User access token and selected Page ID are required.' });
    }

    // 1. Query user pages using User Access Token
    const pagesUrl = `https://graph.facebook.com/v19.0/me/accounts?access_token=${userAccessToken}`;
    const pagesResponse = await fetch(pagesUrl);
    const pagesData = await pagesResponse.json();

    if (pagesData.error) {
      return res.status(400).json({ message: `Meta Error fetching pages: ${pagesData.error.message}` });
    }

    const matchedPage = pagesData.data?.find(p => p.id === selectedPageId);
    if (!matchedPage) {
      return res.status(404).json({ message: 'Selected Page ID not found among your managed Pages.' });
    }

    const shortLivedPageToken = matchedPage.access_token;
    const pageName = matchedPage.name;

    // 2. Exchange for a long-lived Page Access Token (never expires for pages unless re-authorized)
    const exchangeUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.FB_APP_ID}&client_secret=${process.env.FB_APP_SECRET}&fb_exchange_token=${shortLivedPageToken}`;
    const exchangeResponse = await fetch(exchangeUrl);
    const exchangeData = await exchangeResponse.json();

    if (exchangeData.error) {
      return res.status(400).json({ message: `Meta Error exchanging token: ${exchangeData.error.message}` });
    }

    const longLivedPageToken = exchangeData.access_token;

    // 3. Subscribe the App to the Page's webhooks for 'leadgen'
    const subscribeUrl = `https://graph.facebook.com/v19.0/${selectedPageId}/subscribed_apps?subscribed_fields=leadgen&access_token=${longLivedPageToken}`;
    const subscribeResponse = await fetch(subscribeUrl, { method: 'POST' });
    const subscribeData = await subscribeResponse.json();

    if (subscribeData.error) {
      console.error('Failed to subscribe App to Page:', subscribeData.error);
    } else {
      console.log(`Successfully subscribed App to Page ID: ${selectedPageId}`);
    }

    // 4. Save to User settings
    const user = await User.findById(req.user._id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Only Admin accounts can link social integration pages.' });
    }

    if (!user.companyDetails) {
      user.companyDetails = {};
    }

    user.companyDetails.fbPageId = selectedPageId;
    user.companyDetails.fbPageAccessToken = longLivedPageToken;
    user.companyDetails.fbPageName = pageName;
    user.companyDetails.fbAccessToken = userAccessToken;

    await user.save();

    return res.status(200).json({
      message: 'Facebook Page successfully integrated!',
      companyDetails: user.companyDetails
    });
  } catch (err) {
    console.error('Error connecting Facebook page:', err);
    return res.status(500).json({ message: 'Failed to connect Facebook page' });
  }
};

// Disconnect Facebook Page (POST /api/auth/facebook/disconnect)
exports.disconnectFacebookPage = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    if (user.companyDetails) {
      user.companyDetails.fbPageId = '';
      user.companyDetails.fbPageAccessToken = '';
      user.companyDetails.fbPageName = '';
      user.companyDetails.fbAccessToken = '';
      await user.save();
    }

    return res.status(200).json({
      message: 'Facebook Page disconnected successfully.',
      companyDetails: user.companyDetails
    });
  } catch (err) {
    console.error('Error disconnecting Facebook page:', err);
    return res.status(500).json({ message: 'Failed to disconnect Facebook page' });
  }
};
