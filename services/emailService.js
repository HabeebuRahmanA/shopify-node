const transporter = require('../config/email');

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

module.exports = {
  sendOTPEmail,
};
