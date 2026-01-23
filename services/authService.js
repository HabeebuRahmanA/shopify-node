const db = require('../db/db');

// Utility: Generate random 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateToken(email) {
  return Buffer.from(JSON.stringify({ email, iat: Date.now() })).toString('base64');
}

// Create or get user from database
async function getOrCreateUser(email) {
  let user = await db.getUser(email);
  if (!user) {
    user = await db.createUser(email, email.split('@')[0]);
  }
  return user;
}

module.exports = {
  generateOTP,
  generateToken,
  getOrCreateUser,
};
