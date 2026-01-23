const nodemailer = require('nodemailer');

// ===== EMAIL CONFIGURATION (Gmail SMTP) =====
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'habeeburahmana@gmail.com',
    pass: 'rqjlypdglezeqxmb',
  },
});

module.exports = transporter;
