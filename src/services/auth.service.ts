import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { User } from '../models/User';
import { Activity } from '../models/Activity';
import { generateAccessToken, generateRefreshToken } from '../middleware/auth';
import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';

const SALT_ROUNDS = 12;

const getMailer = () => {
  if (!env.smtpHost || !env.smtpUser) return null;
  return nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: false,
    auth: { user: env.smtpUser, pass: env.smtpPass },
  });
};

export const registerUser = async (data: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}) => {
  const existing = await User.findOne({ email: data.email.toLowerCase() });
  if (existing) throw new AppError('Email already registered', 409);

  const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);
  const user = await User.create({
    ...data,
    email: data.email.toLowerCase(),
    password: hashedPassword,
  });

  await Activity.create({
    userId: user._id,
    action: 'registered',
    targetType: 'auth',
    targetName: user.email,
  });

  const accessToken = generateAccessToken(user._id.toString(), user.email);
  const refreshToken = generateRefreshToken(user._id.toString(), user.email);
  await User.findByIdAndUpdate(user._id, { refreshToken });

  const { password: _, refreshToken: __, ...userData } = user.toObject();
  return { user: userData, accessToken, refreshToken };
};

export const loginUser = async (email: string, password: string) => {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password +refreshToken');
  if (!user) throw new AppError('Invalid email or password', 401);

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new AppError('Invalid email or password', 401);

  const accessToken = generateAccessToken(user._id.toString(), user.email);
  const refreshToken = generateRefreshToken(user._id.toString(), user.email);
  user.refreshToken = refreshToken;
  await user.save();

  await Activity.create({
    userId: user._id,
    action: 'logged_in',
    targetType: 'auth',
    targetName: user.email,
  });

  const { password: _, refreshToken: __, ...userData } = user.toObject();
  return { user: userData, accessToken, refreshToken };
};

export const refreshAccessToken = async (refreshToken: string) => {
  const jwt = await import('jsonwebtoken');
  let decoded: { userId: string; email: string };
  try {
    decoded = jwt.verify(refreshToken, env.jwtRefreshSecret) as { userId: string; email: string };
  } catch {
    throw new AppError('Invalid refresh token', 401);
  }

  const user = await User.findById(decoded.userId).select('+refreshToken');
  if (!user || user.refreshToken !== refreshToken) {
    throw new AppError('Invalid refresh token', 401);
  }

  const accessToken = generateAccessToken(user._id.toString(), user.email);
  const newRefreshToken = generateRefreshToken(user._id.toString(), user.email);
  user.refreshToken = newRefreshToken;
  await user.save();

  return { accessToken, refreshToken: newRefreshToken };
};

export const forgotPassword = async (email: string) => {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+resetPasswordToken +resetPasswordExpires');
  if (!user) {
    return { message: 'If that email exists, a reset link has been sent' };
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  user.resetPasswordExpires = new Date(Date.now() + 3600000);
  await user.save();

  const resetUrl = `${env.clientUrl}/reset-password?token=${resetToken}`;
  const mailer = getMailer();

  if (mailer) {
    await mailer.sendMail({
      from: env.smtpFrom,
      to: user.email,
      subject: 'Reset your Document Vault password',
      html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. Link expires in 1 hour.</p>`,
    });
  } else {
    console.log(`Password reset link for ${email}: ${resetUrl}`);
  }

  return { message: 'If that email exists, a reset link has been sent' };
};

export const resetPassword = async (token: string, newPassword: string) => {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: new Date() },
  }).select('+resetPasswordToken +resetPasswordExpires +password +refreshToken');

  if (!user) throw new AppError('Invalid or expired reset token', 400);

  user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  user.refreshToken = undefined; // invalidate existing sessions after a reset
  await user.save();

  await Activity.create({
    userId: user._id,
    action: 'password_reset',
    targetType: 'auth',
    targetName: user.email,
  });

  return { message: 'Password reset successful' };
};

export const changePassword = async (userId: string, currentPassword: string, newPassword: string) => {
  const user = await User.findById(userId).select('+password +refreshToken');
  if (!user) throw new AppError('User not found', 404);

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) throw new AppError('Current password is incorrect', 400);

  user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
  user.refreshToken = undefined; // invalidate existing sessions after a password change
  await user.save();

  return { message: 'Password changed successfully' };
};
