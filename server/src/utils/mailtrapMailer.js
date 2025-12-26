const nodemailer = require('nodemailer');

/**
 * Creates a Nodemailer transport for Mailtrap sandbox SMTP
 */
function createMailerTransport() {
  return nodemailer.createTransport({
    host: process.env.MAILTRAP_HOST || 'sandbox.smtp.mailtrap.io',
    port: Number(process.env.MAILTRAP_PORT) || 2525,
    auth: {
      user: process.env.MAILTRAP_USER,
      pass: process.env.MAILTRAP_PASS,
    },
  });
}

/**
 * Send email with a password reset code
 * @param {Object} params
 * @param {string} params.to - Recipient email
 * @param {string} params.code - Reset code
 * @param {number} params.expiresInMinutes - Code lifetime in minutes
 */
async function sendPasswordResetCodeEmail({ to, code, expiresInMinutes }) {
  const fromAddress = process.env.MAILTRAP_FROM_ADDRESS || 'hello@local.test';
  const fromName = process.env.MAILTRAP_FROM_NAME || 'Currency Rate Fetcher';

  const transport = createMailerTransport();

  const text = [
    'Your password reset code is:',
    String(code),
    '',
    `This code expires in ${expiresInMinutes} minutes.`,
    'If you did not request this, you can ignore this email.',
  ].join('\n');

  return transport.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    to: process.env.UNIVERSAL_EMAIL || to,
    subject: 'Password reset code',
    text,
  });
}

module.exports = {
  sendPasswordResetCodeEmail,
};
