import { Response } from 'express';
import { body } from 'express-validator';
import { AuthRequest } from '../middleware/auth';
import * as authService from '../services/auth.service';

export const registerValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('firstName').trim().notEmpty(),
  body('lastName').trim().notEmpty(),
];

export const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
];

export const register = async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await authService.registerUser(req.body);
  res.status(201).json(result);
};

export const login = async (req: AuthRequest, res: Response): Promise<void> => {
  const { email, password } = req.body;
  const result = await authService.loginUser(email, password);
  res.json(result);
};

export const refresh = async (req: AuthRequest, res: Response): Promise<void> => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(400).json({ message: 'Refresh token required' });
    return;
  }
  const result = await authService.refreshAccessToken(refreshToken);
  res.json(result);
};

export const forgotPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await authService.forgotPassword(req.body.email);
  res.json(result);
};

export const resetPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  const { token, password } = req.body;
  const result = await authService.resetPassword(token, password);
  res.json(result);
};

export const changePassword = async (req: AuthRequest, res: Response): Promise<void> => {
  const { currentPassword, newPassword } = req.body;
  const result = await authService.changePassword(req.userId!, currentPassword, newPassword);
  res.json(result);
};

export const getProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  const { password, refreshToken, resetPasswordToken, resetPasswordExpires, ...user } = req.user!.toObject();
  res.json({ user });
};

export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  const allowed = ['firstName', 'lastName', 'phone', 'bio', 'avatar'];
  const updates: Record<string, string> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const { User } = await import('../models/User');
  const user = await User.findByIdAndUpdate(req.userId, updates, { new: true });
  res.json({ user });
};

export const updateSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  const { User } = await import('../models/User');
  const user = await User.findByIdAndUpdate(
    req.userId,
    { settings: req.body },
    { new: true }
  );
  res.json({ settings: user?.settings });
};

export const logout = async (req: AuthRequest, res: Response): Promise<void> => {
  const { User } = await import('../models/User');
  await User.findByIdAndUpdate(req.userId, { refreshToken: null });
  res.json({ message: 'Logged out successfully' });
};
