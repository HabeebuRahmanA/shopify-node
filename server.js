// Load environment variables - only in development
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: '.env.development.local' });
}const express = require('express');
const nodemailer = require('nodemailer');
const app = express();
const PORT = process.env.PORT || 3001;
const db = require('./db/db');

app.use(express.json());

// ===== EMAIL CONFIGURATION (Gmail SMTP) =====
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'habeeburahmana@gmail.com',
    pass: 'rqjlypdglezeqxmb',
  },
});

// In-memory storage for OTPs
// const otpStore = {};
// send-otpapp.post('/auth/send-otp'const usersStore = {};

// Utility: Generate random 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Utility: Send OTP email via Gmail
async function sendOTPEmail(email, otp) {
  try {
    const mailOptions = {
      from: 'habeeburahmana@gmail.com',
      to: email,
      subject: 'Your OTP Code for Shopify Mobile App',
      html: `
        <h2>Your One-Time Password (OTP)</h2>
        <p>Hello,</p>
        <p>Your OTP code is: <strong>${otp}</strong></p>
        <p>This code will expire in 10 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `,
    };
    
    await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${email}`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Email error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

function generateToken(email) {
  return Buffer.from(JSON.stringify({ email, iat: Date.now() })).toString('base64');
}

app.get('/', (req, res) => {
  res.json({ message: 'Server running', api: 'Shopify OTP Auth' });
});

// Test email endpoint
app.post('/test-email', async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }
  
  const result = await sendOTPEmail(email, '123456');
  res.json(result);
});

// Step 1: Send OTP
app.post('/auth/send-otp', async (req, res) => {
  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
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
});

// Step 2: Verify OTP
app.post('/auth/verify-otp', async (req, res) => {
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
  let user = await db.getUser(email);
  if (!user) {
    user = await db.createUser(email, email.split('@')[0]);
  }
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

app.listen(PORT, () => {
  console.log(`🚀 Server on port ${PORT}`);
  console.log(`📧 Gmail SMTP enabled`);
  console.log(`POST /test-email - Test email sending`);
  console.log(`POST /auth/send-otp - Send OTP`);
  console.log(`POST /auth/verify-otp - Verify OTP`);
});
