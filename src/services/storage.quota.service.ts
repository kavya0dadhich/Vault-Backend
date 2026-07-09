import { File } from '../models/File';
import { Card } from '../models/Card';
import { AppError } from '../middleware/errorHandler';

export const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export const getUserStorageUsage = async (userId: string) => {
  const fileFilter = { userId, isTrashed: false, isFolder: false };

  const [fileAgg, cardAgg] = await Promise.all([
    File.aggregate([{ $match: fileFilter }, { $group: { _id: null, total: { $sum: '$size' } } }]),
    Card.aggregate([
      { $match: { userId } },
      { $group: { _id: null, total: { $sum: { $add: ['$frontSize', '$backSize'] } } } },
    ]),
  ]);

  const filesBytes = fileAgg[0]?.total ?? 0;
  const cardsBytes = cardAgg[0]?.total ?? 0;
  const totalBytes = filesBytes + cardsBytes;

  return {
    filesBytes,
    cardsBytes,
    totalBytes,
    limitBytes: STORAGE_LIMIT_BYTES,
    percentage: Math.min((totalBytes / STORAGE_LIMIT_BYTES) * 100, 100),
  };
};

/** Reject upload if current usage + incoming bytes would exceed the storage cap. */
export const assertStorageQuota = async (userId: string, incomingBytes: number): Promise<void> => {
  if (incomingBytes <= 0) return;

  const { totalBytes, limitBytes } = await getUserStorageUsage(userId);
  if (totalBytes + incomingBytes > limitBytes) {
    const remaining = Math.max(0, limitBytes - totalBytes);
    throw new AppError(
      `Storage limit reached. You have ${formatBytes(remaining)} left of your ${formatBytes(limitBytes)} plan.`,
      400
    );
  }
};
