const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// In-memory storage for OTPs (for demo only, use Redis/DB in production)
const otpStore = {}; // { email: { code: '123456', expiresAt: timestamp } }
const usersStore = {}; // { email: { id, email, name, createdAt } }

// Utility: Generate random 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Utility: Send OTP email (mock for now)
function sendOTPEmail(email, otp) {
  console.log(`📧 OTP sent to ${email}: ${otp}`);
  // Later replace with Nodemailer or SendGrid
}

// Utility: Generate JWT token (mock for now)
function generateToken(email) {
  // Later replace with jsonwebtoken library
  return Buffer.from(JSON.stringify({ email, iat: Date.now() })).toString('base64');
}

// ===== HEALTH CHECK =====
app.get('/', (req, res) => {
  res.json({ message: 'Server is running', api: 'Shopify Mobile App Backend' });
});

// ===== AUTH ROUTES =====

// Step 1: Send OTP to email
app.post('/auth/send-otp', (req, res) => {
  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  const otp = generateOTP();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  otpStore[email] = { code: otp, expiresAt };
  sendOTPEmail(email, otp);

  res.json({
    success: true,
    message: 'OTP sent to email',
    email,
    // ⚠️ Remove this in production (only for testing)
    _otp: otp
  });
});

// Step 2: Verify OTP and return token
app.post('/auth/verify-otp', (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP required' });
  }

  const stored = otpStore[email];

  if (!stored) {
    return res.status(400).json({ error: 'OTP not found or expired' });
  }

  if (Date.now() > stored.expiresAt) {
    delete otpStore[email];
    return res.status(400).json({ error: 'OTP expired' });
  }

  if (stored.code !== otp) {
    return res.status(400).json({ error: 'Invalid OTP' });
  }

  // OTP verified! Create or update user
  if (!usersStore[email]) {
    usersStore[email] = {
      id: `user_${Date.now()}`,
      email,
      name: email.split('@')[0],
      createdAt: new Date().toISOString()
    };
  }

  const user = usersStore[email];
  const token = generateToken(email);

  // Clean up OTP
  delete otpStore[email];

  res.json({
    success: true,
    message: 'Login successful',
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name
    }
  });
});

// Step 3: Get current user (protected route example)
app.get('/auth/me', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token required' });
  }

  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    const user = usersStore[decoded.email];

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, user });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/`);
  console.log(`🔐 Auth endpoints ready:`);
  console.log(`   POST /auth/send-otp`);
  console.log(`   POST /auth/verify-otp`);
  console.log(`   GET /auth/me`);
});
