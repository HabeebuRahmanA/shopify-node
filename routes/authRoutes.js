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

  console.log('🔍 [OTP SEND] Request received for email:', email);

  if (!email || !email.includes('@')) {
    console.log('❌ [OTP SEND] Invalid email format');
    return res.status(400).json({ error: 'Valid email required' });
  }

  try {
    console.log('🔍 [OTP SEND] Checking if customer exists in Shopify...');
    
    // Check if customer exists in Shopify first
    const customerExists = await checkShopifyCustomerExists(email);
    
    console.log('📊 [OTP SEND] Customer exists in Shopify:', customerExists);
    
    if (!customerExists) {
      console.log('❌ [OTP SEND] Customer not found in Shopify');
      return res.status(404).json({ 
        error: 'Email not found in our store. Please use the email associated with your Shopify account.' 
      });
    }

    console.log('✅ [OTP SEND] Customer found, generating OTP...');
    
    const otp = generateOTP();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    await db.storeOTP(email, otp, new Date(expiresAt));
    console.log('💾 [OTP SEND] OTP stored in database');

    const emailResult = await sendOTPEmail(email, otp);
    console.log('📧 [OTP SEND] Email service result:', emailResult.success ? 'SUCCESS' : 'FAILED');
    
    if (!emailResult.success) {
      console.log('❌ [OTP SEND] Failed to send email');
      return res.status(500).json({ error: 'Failed to send email' });
    }

    console.log('✅ [OTP SEND] OTP sent successfully to:', email);
    
    res.json({
      success: true,
      message: 'OTP sent to email',
      email,
    });
  } catch (error) {
    console.error('🔥 [OTP SEND] Error:', error.message);
    console.error('🔥 [OTP SEND] Full error:', error);
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
