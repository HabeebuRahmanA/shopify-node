const express = require('express');
const router = express.Router();

const db = require('../db/db');
const { sendOTPEmail } = require('../services/emailService');
const { generateOTP, generateToken, getOrCreateUser } = require('../services/authService');
const { checkShopifyCustomerExists } = require('./shopifyRoutes');

router.get('/', (req, res) => {
  res.json({ message: 'Server running', api: 'Shopify OTP Auth' });
});

// Test email endpoint
router.post('/test-email', async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }
  
  const result = await sendOTPEmail(email, '123456');
  res.json(result);
});

// Step 1: Send OTP
router.post('/auth/send-otp', async (req, res) => {
  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  try {
    // Check if customer exists in Shopify first
    const customerExists = await checkShopifyCustomerExists(email);
    
    if (!customerExists) {
      return res.status(404).json({ 
        error: 'Email not found in our store. Please use the email associated with your Shopify account.' 
      });
    }

    const otp = generateOTP();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    await db.storeOTP(email, otp, new Date(expiresAt));

    const emailResult = await sendOTPEmail(email, otp);
    
    if (!emailResult.success) {
      return res.status(500).json({ error: 'Failed to send email' });
    }

    res.json({
      success: true,
      message: 'OTP sent to email',
      email,
    });
  } catch (error) {
    console.error('Error in send-otp:', error);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// Step 2: Verify OTP
router.post('/auth/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP required' });
  }

  const stored = await db.getOTP(email);
  if (!stored) {
    return res.status(400).json({ error: 'OTP not found' });
  }

  if (Date.now() > stored.expiresAt) {
//     delete otpStore[email];
//     return res.status(400).json({ error: 'OTP expired' });
  }

  if (stored.code !== otp) {
    return res.status(400).json({ error: 'Invalid OTP' });
  }

// Create or get user from database
  const user = await getOrCreateUser(email);
//   const user = usersStore[email];
  const token = generateToken(email);
  await db.deleteOTP(email);
  res.json({
    success: true,
    message: 'Login successful',
    token,
    user,
  });
});

module.exports = router;
