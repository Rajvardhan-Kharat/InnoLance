import nodemailer from 'nodemailer';

function env(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v;
}

export async function sendEmail({ to, subject, text, html }) {
  const host = env('SMTP_HOST');
  const portRaw = env('SMTP_PORT');
  const user = env('SMTP_USER');
  const pass = env('SMTP_PASS');
  const from = env('SMTP_FROM');

  if (!host || !portRaw || !from) {
    throw new Error('SMTP_HOST, SMTP_PORT, and SMTP_FROM must be configured to send emails.');
  }

  const port = Number(portRaw);
  if (!Number.isFinite(port)) throw new Error('SMTP_PORT must be a number.');

  // If port 465, secure is typically required. For 587, STARTTLS is typical.
  const secure = port === 465 || env('SMTP_SECURE', '').toLowerCase() === 'true';

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });

  const mail = {
    from,
    to,
    subject,
    text,
    html,
  };

  return transporter.sendMail(mail);
}

