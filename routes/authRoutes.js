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

  try {
    console.log('🔍 [OTP VERIFY] Verifying OTP for email:', email);
    
    const stored = await db.getOTP(email);
    if (!stored) {
      console.log('❌ [OTP VERIFY] OTP not found for email:', email);
      return res.status(400).json({ error: 'OTP not found or expired' });
    }

    if (Date.now() > stored.expiresAt) {
      console.log('❌ [OTP VERIFY] OTP expired for email:', email);
      await db.deleteOTP(email);
      return res.status(400).json({ error: 'OTP expired' });
    }

    if (stored.code !== otp) {
      console.log('❌ [OTP VERIFY] Invalid OTP for email:', email);
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    console.log('✅ [OTP VERIFY] OTP validated for email:', email);

    // Create or get user from database (force refresh for fresh login)
    const user = await getOrCreateUser(email, true); // true = use Admin API
    console.log('📊 [OTP VERIFY] User data after getOrCreateUser:', JSON.stringify(user, null, 2));
    const token = generateToken(email);
    
    // Store session in database
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    await db.createSession(user.id, token, expiresAt);
    
    console.log('💾 [OTP VERIFY] Session created for user:', user.id);
    
    // Clean up OTP
    await db.deleteOTP(email);
    
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user,
      expiresIn: '30 days'
    });
  } catch (error) {
    console.error('🔥 [OTP VERIFY] Error:', error.message);
    console.error('🔥 [OTP VERIFY] Full error:', error);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// Validate session
router.post('/auth/validate', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Token required' });
  }

  try {
    console.log('🔍 [AUTH VALIDATE] Validating token');
    
    const session = await db.getSession(token);
    if (!session) {
      console.log('❌ [AUTH VALIDATE] Session not found');
      return res.status(401).json({ error: 'Invalid session' });
    }

    if (session.revoked || Date.now() > new Date(session.expires_at).getTime()) {
      console.log('❌ [AUTH VALIDATE] Session expired or revoked');
      await db.revokeSession(token);
      return res.status(401).json({ error: 'Session expired' });
    }

    const user = await db.getUserById(session.user_id);
    if (!user) {
      console.log('❌ [AUTH VALIDATE] User not found');
      return res.status(401).json({ error: 'User not found' });
    }

    // Fetch fresh data using Storefront API for auto-login
    try {
      console.log('📡 [AUTH VALIDATE] Fetching fresh Shopify data for auto-login...');
      const freshUserData = await getOrCreateUser(user.email, false); // false = use Storefront API
      if (freshUserData && freshUserData.dataSource !== 'storefront_fallback') {
        console.log('✅ [AUTH VALIDATE] Fresh data fetched for user:', user.email);
        console.log('📊 [AUTH VALIDATE] Data source:', freshUserData.dataSource);
        
        // Merge local user data with fresh Shopify data, preserving local ID
        const mergedUserData = {
          ...user, // Keep local database fields (id, email, created_at, etc.)
          ...freshUserData, // Add Shopify fields (phone, shopify_created_at, etc.)
        };
        
        return res.json({
          success: true,
          user: mergedUserData
        });
      } else {
        console.log('⚠️ [AUTH VALIDATE] Fresh data fetch failed, using cached data');
      }
    } catch (error) {
      console.log('⚠️ [AUTH VALIDATE] Could not fetch fresh data, using cached data:', error.message);
    }

    console.log('✅ [AUTH VALIDATE] Session valid for user:', user.email);
    console.log('📊 [AUTH VALIDATE] Using cached user data from database');
    
    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('🔥 [AUTH VALIDATE] Error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Logout
router.post('/auth/logout', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Token required' });
  }

  try {
    console.log('🔍 [AUTH LOGOUT] Revoking token');
    await db.revokeSession(token);
    console.log('✅ [AUTH LOGOUT] Session revoked');
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('🔥 [AUTH LOGOUT] Error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
