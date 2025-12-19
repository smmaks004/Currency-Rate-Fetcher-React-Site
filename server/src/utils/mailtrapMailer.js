const Nodemailer = require('nodemailer');
const { MailtrapTransport } = require('mailtrap');

// function getEnv(name, fallback) {
//   const v = process.env[name];
//   if (v === undefined || v === null || String(v).trim() === '') return fallback;
//   return String(v);
// }

function createMailerTransport() {
//   const token = getEnv('MAILTRAP_TOKEN');
  const token = process.env.MAILTRAP_TOKEN;
  if (!token) {
  throw new Error('MAILTRAP_TOKEN is not set');
  }

  return Nodemailer.createTransport(
  MailtrapTransport({
      token,
  })
  );
}

async function sendPasswordResetCodeEmail({ to, code, expiresInMinutes }) {
//   const fromAddress = getEnv('MAILTRAP_FROM_ADDRESS', 'hello@demomailtrap.co');
//   const fromName = getEnv('MAILTRAP_FROM_NAME', 'Currency Rate Fetcher');
//   const category = getEnv('MAILTRAP_CATEGORY', 'Password Reset');
  const fromAddress = process.env.MAILTRAP_FROM_ADDRESS;
  const fromName = process.env.MAILTRAP_FROM_NAME;
  const category = process.env.MAILTRAP_CATEGORY;


  const transport = createMailerTransport();

  
  // const destination = process.env.UNIVERSAL_EMAIL;////

  const text = [
  'Your password reset code is:',
  String(code),
  '',
  `This code expires in ${expiresInMinutes} minutes.`,
  'If you did not request this, you can ignore this email.',
  ].join('\n');

  return transport.sendMail({
  from: { address: fromAddress, name: fromName },
  // to: [String(to)],
  to: process.env.UNIVERSAL_EMAIL,
  subject: 'Password reset code',
  text,
  category,
  });
}

module.exports = {
  sendPasswordResetCodeEmail,
};
