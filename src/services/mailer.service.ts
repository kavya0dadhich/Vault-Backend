import nodemailer from 'nodemailer';
import { env } from '../config/env';

let transporter: ReturnType<typeof nodemailer.createTransport> | null | undefined;

const getMailer = () => {
  if (transporter === undefined) {
    transporter =
      env.smtpHost && env.smtpUser
        ? nodemailer.createTransport({
            host: env.smtpHost,
            port: env.smtpPort,
            secure: false,
            auth: { user: env.smtpUser, pass: env.smtpPass },
          })
        : null;
  }
  return transporter;
};

// Shared send path for every outbound email (password reset, welcome, family
// invites/OTP). When SMTP isn't configured (e.g. local dev), falls back to
// logging so the flow is still testable without real credentials.
export const sendMail = async (options: {
  to: string;
  subject: string;
  html: string;
  fallbackLog: string;
}): Promise<void> => {
  const mailer = getMailer();
  if (mailer) {
    await mailer.sendMail({ from: env.smtpFrom, to: options.to, subject: options.subject, html: options.html });
  } else {
    console.log(options.fallbackLog);
  }
};
