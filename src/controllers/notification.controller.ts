import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as notificationService from '../services/notification.service';

const param = (value: string | string[]): string => (Array.isArray(value) ? value[0] : value);

export const listNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await notificationService.listNotifications(req.userId!);
  res.json(result);
};

export const markRead = async (req: AuthRequest, res: Response): Promise<void> => {
  const notification = await notificationService.markNotificationRead(req.userId!, param(req.params.id));
  res.json({ notification });
};

export const markAllRead = async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await notificationService.markAllNotificationsRead(req.userId!);
  res.json(result);
};
