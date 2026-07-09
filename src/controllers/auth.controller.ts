import { Response } from 'express';
import { body } from 'express-validator';
import { AuthRequest } from '../middleware/auth';
import { User } from '../models/User';
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
    if (typeof req.body[key] === 'string') updates[key] = req.body[key];
  }

  const user = await User.findByIdAndUpdate(req.userId, updates, { new: true });
  res.json({ user });
};

export const updateSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  // Merge only known, validated fields via dot-notation $set so a partial update
  // (e.g. just { theme }) doesn't wipe the rest of the settings object, and no
  // arbitrary/unknown keys can be mass-assigned onto the user document.
  const body = (req.body ?? {}) as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  if (typeof body.theme === 'string' && ['light', 'dark', 'system'].includes(body.theme)) {
    updates['settings.theme'] = body.theme;
  }
  if (typeof body.accentColor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(body.accentColor)) {
    updates['settings.accentColor'] = body.accentColor;
  }
  if (body.notifications && typeof body.notifications === 'object') {
    const n = body.notifications as Record<string, unknown>;
    (['email', 'upload', 'share'] as const).forEach((k) => {
      if (typeof n[k] === 'boolean') updates[`settings.notifications.${k}`] = n[k];
    });
  }

  const user = await User.findByIdAndUpdate(req.userId, { $set: updates }, { new: true });
  res.json({ settings: user?.settings });
};

export const logout = async (req: AuthRequest, res: Response): Promise<void> => {
  await User.findByIdAndUpdate(req.userId, { refreshToken: null });
  res.json({ message: 'Logged out successfully' });
};
