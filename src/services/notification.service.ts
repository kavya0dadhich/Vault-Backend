import { Notification, NotificationType } from '../models/Notification';
import { Types } from 'mongoose';
import { AppError } from '../middleware/errorHandler';

export const createNotification = async (
  userId: string | Types.ObjectId,
  type: NotificationType,
  title: string,
  message: string,
  relatedId?: string | Types.ObjectId
) => {
  await Notification.create({ userId, type, title, message, relatedId });
};

export const listNotifications = async (userId: string) => {
  const [notifications, unreadCount] = await Promise.all([
    Notification.find({ userId }).sort({ createdAt: -1 }).limit(50).lean(),
    Notification.countDocuments({ userId, isRead: false }),
  ]);
  return { notifications, unreadCount };
};

export const markNotificationRead = async (userId: string, notificationId: string) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { isRead: true },
    { new: true }
  );
  if (!notification) throw new AppError('Notification not found', 404);
  return notification;
};

export const markAllNotificationsRead = async (userId: string) => {
  await Notification.updateMany({ userId, isRead: false }, { isRead: true });
  return { message: 'All notifications marked as read' };
};
