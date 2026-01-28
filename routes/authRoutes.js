const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');
const db = require('../db/db');
const { sendOTPEmail } = require('../services/emailService');
const { generateOTP, generateToken, getOrCreateUser, createShopifyCustomer } = require('../services/authService');
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

// Step 1: Send OTP for registration (works even if user doesn't exist)
router.post('/auth/send-otp-register', async (req, res) => {
  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  try {
    console.log('🔍 [REGISTER OTP] Sending OTP for registration:', email);
    
    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store OTP (even if user doesn't exist)
    await db.storeOTP(email, otp, expiresAt);
    console.log('💾 [REGISTER OTP] OTP stored for registration:', email);

    // Send OTP email
    await sendOTPEmail(email, otp);
    console.log('📧 [REGISTER OTP] OTP email sent for registration:', email);

    res.json({
      success: true,
      message: 'OTP sent to your email for registration',
      expiresIn: '10 minutes'
    });
  } catch (error) {
    console.error('🔥 [REGISTER OTP] Error:', error.message);
    res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
  }
});

// Send OTP for login (only works if user exists)
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

// Register new user with full details
router.post('/auth/register', async (req, res) => {
  const { email, firstName, lastName, phone, otp } = req.body;

  if (!email || !firstName || !lastName || !otp) {
    return res.status(400).json({ error: 'Email, first name, last name, and OTP are required' });
  }

  try {
    console.log('🔍 [REGISTER] Registering new user:', email);
    console.log('👤 [REGISTER] Name:', `${firstName} ${lastName}`);
    console.log('📱 [REGISTER] Phone:', phone || 'Not provided');
    console.log('🔢 [REGISTER] OTP:', otp);
    
    // Verify OTP first
    const storedOtp = await db.getOTP(email);
    if (!storedOtp) {
      return res.status(400).json({ error: 'OTP not found. Please request a new OTP.' });
    }

    // Check if OTP is expired
    if (new Date(storedOtp.expires_at) < new Date()) {
      await db.deleteOTP(email);
      return res.status(400).json({ error: 'OTP has expired. Please request a new OTP.' });
    }

    // Verify OTP
    if (storedOtp.code !== otp) {
      return res.status(400).json({ error: 'Invalid OTP. Please try again.' });
    }

    console.log('✅ [REGISTER] OTP verified successfully');

    // Check if user already exists
    const existingUser = await db.getUser(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Create user in local database
    const localUser = await db.createUser(email, `${firstName} ${lastName}`);
    console.log('👤 [REGISTER] Created local user:', localUser.id);

    // Create Shopify customer
    let shopifyCustomer;
    try {
      shopifyCustomer = await createShopifyCustomer(email, firstName, lastName);
      console.log('✅ [REGISTER] Shopify customer created:', shopifyCustomer.id);
    } catch (shopifyError) {
      console.log('⚠️ [REGISTER] Shopify customer creation failed:', shopifyError.message);
      // Continue with local user if Shopify creation fails
    }

    // Prepare user data
    let userData = {
      id: localUser.id,           // IMPORTANT: Use local database ID
      email: localUser.email,
      name: localUser.name,
      created_at: localUser.created_at,
      updated_at: localUser.updated_at,
    };

    // Add Shopify data if available
    if (shopifyCustomer) {
      userData = {
        ...userData,
        shopify_id: shopifyCustomer.id,
        shopify_email: shopifyCustomer.email,
        shopify_firstName: shopifyCustomer.firstName,
        shopify_lastName: shopifyCustomer.lastName,
        shopify_phone: shopifyCustomer.phone,
        shopify_createdAt: shopifyCustomer.createdAt,
        shopify_state: shopifyCustomer.state,
        shopify_defaultAddress: shopifyCustomer.defaultAddress,
        shopify_addresses: shopifyCustomer.addresses || [],
        dataSource: shopifyCustomer.dataSource,
        isNewCustomer: shopifyCustomer.isNewCustomer,
      };

      // Update database with Shopify data
      try {
        await db.updateUserShopifyData(email, shopifyCustomer);
        console.log('💾 [REGISTER] Updated database with Shopify data');
      } catch (dbError) {
        console.log('⚠️ [REGISTER] Database update failed:', dbError.message);
      }
    }

    // Generate token
    const token = generateToken(email);
    
    // Store session
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    await db.createSession(userData.id, token, expiresAt);
    
    // Clean up OTP
    await db.deleteOTP(email);
    
    console.log('✅ [REGISTER] Registration successful for:', email);
    console.log('💾 [REGISTER] Session created for user:', userData.id);
    
    res.json({
      success: true,
      message: 'Registration successful',
      token,
      user: userData,
      expiresIn: '30 days'
    });
  } catch (error) {
    console.error('🔥 [REGISTER] Error:', error.message);
    console.error('🔥 [REGISTER] Full error:', error);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// Add address for user
router.post('/auth/add-address', async (req, res) => {
  const { email, address } = req.body;

  if (!email || !address) {
    return res.status(400).json({ error: 'Email and address are required' });
  }

  if (!address.address1 || !address.city || !address.province || !address.zip || !address.country) {
    return res.status(400).json({ error: 'All required address fields must be provided' });
  }

  try {
    console.log('🔍 [ADD ADDRESS] Adding address for user:', email);
    console.log('📍 [ADD ADDRESS] Address data:', JSON.stringify(address, null, 2));

    // Get user from database and enrich with Shopify data
    const user = await getOrCreateUser(email);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user has Shopify customer ID
    console.log('🔍 [ADD ADDRESS] User data keys:', Object.keys(user));
    console.log('🔍 [ADD ADDRESS] Shopify ID check:', {
      shopify_id: user.shopify_id,
      id: user.id,
      customerId: user.customerId,
      customer_id: user.customer_id,
      hasShopifyId: !!(user.shopify_id || user.id)
    });
    
    // Use either shopify_id or id (Shopify Admin API returns ID in 'id' field)
    const shopifyCustomerId = user.shopify_id || user.id;
    
    if (!shopifyCustomerId) {
      return res.status(400).json({ 
        error: 'User does not have Shopify customer ID. Please try again or contact support.',
        debug: {
          userKeys: Object.keys(user),
          shopify_id: user.shopify_id,
          id: user.id,
          customerId: user.customerId,
          customer_id: user.customer_id
        }
      });
    }

    // Create address in Shopify first
    try {
      console.log('🛒 [ADD ADDRESS] Creating address in Shopify for customer:', shopifyCustomerId);
      
      const mutation = `
        mutation customerAddressCreate($customerId: ID!, $address: MailingAddressInput!) {
          customerAddressCreate(customerId: $customerId, address: $address) {
            customerAddress {
              id
              address1
              address2
              city
              province
              zip
              country
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const variables = {
        customerId: shopifyCustomerId,
        address: {
          address1: address.address1,
          address2: address.address2 || '',
          city: address.city,
          province: address.province,
          zip: address.zip,
          country: address.country,
        }
      };

      const shopifyRoutes = require('./shopifyRoutes');
      const { queryShopifyAdmin } = shopifyRoutes;
      
      const shopifyResponse = await queryShopifyAdmin(mutation, variables);
      console.log('📊 [ADD ADDRESS] Shopify response:', JSON.stringify(shopifyResponse, null, 2));

      if (shopifyResponse.customerAddressCreate && shopifyResponse.customerAddressCreate.customerAddress) {
        const shopifyAddress = shopifyResponse.customerAddressCreate.customerAddress;
        console.log('✅ [ADD ADDRESS] Address created in Shopify:', shopifyAddress.id);
        
        // Store reference in Neon (simple approach - just store the Shopify address ID)
        const addressReference = {
          user_id: user.id,
          shopify_address_id: shopifyAddress.id,
          address1: address.address1,
          city: address.city,
          is_default: address.isDefault || false,
          created_at: new Date(),
        };

        // For now, store in a simple way - we can use a JSON field in users table or create a simple reference table
        // Let's use a simple approach: store in users table as JSON array
        await db.addUserAddressReference(user.id, addressReference);
        console.log('✅ [ADD ADDRESS] Address reference stored in Neon');

        res.json({
          success: true,
          message: 'Address added successfully',
          address: {
            id: shopifyAddress.id,
            address1: shopifyAddress.address1,
            address2: shopifyAddress.address2,
            city: shopifyAddress.city,
            province: shopifyAddress.province,
            zip: shopifyAddress.zip,
            country: shopifyAddress.country,
            isDefault: address.isDefault || false,
          }
        });
      } else if (shopifyResponse.customerAddressCreate && shopifyResponse.customerAddressCreate.userErrors.length > 0) {
        console.log('❌ [ADD ADDRESS] Shopify address creation errors:');
        shopifyResponse.customerAddressCreate.userErrors.forEach(error => {
          console.log(`   - Field: ${error.field}, Message: ${error.message}`);
        });
        return res.status(400).json({ 
          error: 'Failed to create address in Shopify',
          details: shopifyResponse.customerAddressCreate.userErrors
        });
      } else {
        throw new Error('Unknown Shopify response format');
      }
    } catch (shopifyError) {
      console.log('⚠️ [ADD ADDRESS] Failed to create address in Shopify:', shopifyError.message);
      return res.status(500).json({ error: 'Failed to create address in Shopify: ' + shopifyError.message });
    }
  } catch (error) {
    console.error('🔥 [ADD ADDRESS] Error:', error.message);
    console.error('🔥 [ADD ADDRESS] Full error:', error);
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

    console.log('📊 [AUTH VALIDATE] Local user data from database:');
    console.log('📊 [AUTH VALIDATE] User ID:', user.id);
    console.log('📊 [AUTH VALIDATE] User ID type:', typeof user.id);
    console.log('📊 [AUTH VALIDATE] User email:', user.email);
    console.log('📊 [AUTH VALIDATE] All local user keys:', Object.keys(user));

    // Fetch fresh data using Storefront API for auto-login
    try {
      console.log('📡 [AUTH VALIDATE] Fetching fresh Shopify data for auto-login...');
      const freshUserData = await getOrCreateUser(user.email, false); // false = use Storefront API
      if (freshUserData && freshUserData.dataSource !== 'storefront_fallback') {
        console.log('✅ [AUTH VALIDATE] Fresh data fetched for user:', user.email);
        console.log('📊 [AUTH VALIDATE] Data source:', freshUserData.dataSource);
        
        // Merge local user data with fresh Shopify data, preserving local ID
        const mergedUserData = {
          ...freshUserData, // Start with Shopify data
          id: user.id,       // Explicitly preserve local database ID
          email: user.email, // Preserve local email
          created_at: user.created_at, // Preserve local created_at
          updated_at: new Date().toISOString(), // Update timestamp
        };
        
        console.log('📊 [AUTH VALIDATE] Merged user data:');
        console.log('📊 [AUTH VALIDATE] Final User ID:', mergedUserData.id);
        console.log('📊 [AUTH VALIDATE] Final User ID type:', typeof mergedUserData.id);
        console.log('📊 [AUTH VALIDATE] Final User email:', mergedUserData.email);
        
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
