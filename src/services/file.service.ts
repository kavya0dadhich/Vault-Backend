import path from 'path';
import { Types } from 'mongoose';
import { File, IFile, FileCategory } from '../models/File';
import { Activity } from '../models/Activity';
import { uploadFile, deleteStoredFile, getPresignedDownloadUrl, getPresignedViewUrl, getPresignedUploadUrl } from './storage.service';
import { getDashboardCardSummary } from './card.service';
import { getUserStorageUsage, assertStorageQuota } from './storage.quota.service';
import { AppError } from '../middleware/errorHandler';

// Everything that counts as a "document" for the Documents page, search filter, and dashboard.
// Kept in one place so all three stay in sync (Word, Excel, PDF, text, CSV).
const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
];

const ALLOWED_MIME_TYPES = [
  // Note: image/svg+xml intentionally excluded — SVGs can embed <script> and are
  // rendered inline on preview, making them a stored-XSS vector.
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip', 'application/x-zip-compressed',
  'text/plain', 'text/csv',
  'video/mp4', 'video/webm', 'video/quicktime',
];

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export const validateFile = (mimeType: string, size: number): void => {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new AppError(`File type ${mimeType} is not allowed`, 400);
  }
  if (size > MAX_FILE_SIZE) {
    throw new AppError('File size exceeds 100MB limit', 400);
  }
};

const logActivity = async (
  userId: string,
  action: string,
  targetType: 'file' | 'folder',
  targetId: Types.ObjectId,
  targetName: string,
  metadata?: Record<string, unknown>
) => {
  await Activity.create({ userId, action, targetType, targetId, targetName, metadata });
};

export const createFolder = async (userId: string, name: string, folderId?: string) => {
  const parent = folderId ? await File.findOne({ _id: folderId, userId, isFolder: true, isTrashed: false }) : null;
  if (folderId && !parent) throw new AppError('Parent folder not found', 404);

  const folder = await File.create({
    userId,
    name,
    originalName: name,
    isFolder: true,
    folderId: folderId || null,
    parentPath: parent ? `${parent.parentPath}${parent.name}/` : '/',
    mimeType: 'folder',
  });

  await logActivity(userId, 'created_folder', 'folder', folder._id, name);
  return folder;
};

export const uploadFiles = async (
  userId: string,
  files: Express.Multer.File[],
  options: { folderId?: string; category?: FileCategory; tags?: string[] }
) => {
  const totalIncoming = files.reduce((sum, f) => sum + f.size, 0);
  await assertStorageQuota(userId, totalIncoming);

  const results: IFile[] = [];

  for (const file of files) {
    validateFile(file.mimetype, file.size);
    const { key, url, storageType } = await uploadFile(userId, file.buffer, file.originalname, file.mimetype);

    const doc = await File.create({
      userId,
      name: file.originalname,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      s3Key: key,
      s3Url: url,
      storageType,
      folderId: options.folderId || null,
      category: options.category || 'personal',
      tags: options.tags || [],
    });

    await logActivity(userId, 'uploaded', 'file', doc._id, file.originalname, { size: file.size });
    results.push(doc);
  }

  return results;
};

export const getFiles = async (
  userId: string,
  query: {
    folderId?: string | null;
    isTrashed?: boolean;
    isFavorite?: boolean;
    category?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }
) => {
  const filter: Record<string, unknown> = { userId, isTrashed: query.isTrashed ?? false };
  if (query.folderId !== undefined) filter.folderId = query.folderId || null;
  if (query.isFavorite) filter.isFavorite = true;
  if (query.category) filter.category = query.category;

  const page = query.page || 1;
  const limit = Math.min(query.limit || 20, 100);
  const skip = (page - 1) * limit;
  const sortField = query.sortBy || 'createdAt';
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

  const [files, total] = await Promise.all([
    File.find(filter).sort({ isFolder: -1, [sortField]: sortOrder }).skip(skip).limit(limit).lean(),
    File.countDocuments(filter),
  ]);

  return { files, total, page, totalPages: Math.ceil(total / limit) };
};

export const searchFiles = async (
  userId: string,
  params: {
    q?: string;
    tags?: string;
    fileType?: string;
    category?: string;
    folderId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }
) => {
  const filter: Record<string, unknown> = { userId, isTrashed: false, isFolder: false };

  if (params.q) {
    // Escape regex metacharacters so a search term can't inject a regex or
    // trigger catastrophic backtracking (ReDoS) against the collection.
    const safe = params.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: safe, $options: 'i' } },
      { originalName: { $regex: safe, $options: 'i' } },
      { tags: { $regex: safe, $options: 'i' } },
    ];
  }
  if (params.tags) filter.tags = { $in: params.tags.split(',').map((t) => t.trim()) };
  if (params.category) filter.category = params.category;
  if (params.folderId) filter.folderId = params.folderId;
  if (params.fileType) {
    if (params.fileType === 'image') filter.mimeType = { $regex: '^image/' };
    else if (params.fileType === 'document') filter.mimeType = { $in: DOCUMENT_MIME_TYPES };
    else if (params.fileType === 'video') filter.mimeType = { $regex: '^video/' };
    else filter.mimeType = params.fileType;
  }
  if (params.dateFrom || params.dateTo) {
    filter.createdAt = {};
    if (params.dateFrom) (filter.createdAt as Record<string, Date>).$gte = new Date(params.dateFrom);
    if (params.dateTo) (filter.createdAt as Record<string, Date>).$lte = new Date(params.dateTo);
  }

  const page = params.page || 1;
  const limit = Math.min(params.limit || 20, 100);
  const skip = (page - 1) * limit;

  const [files, total] = await Promise.all([
    File.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    File.countDocuments(filter),
  ]);

  return { files, total, page, totalPages: Math.ceil(total / limit) };
};

export const renameFile = async (userId: string, fileId: string, name: string) => {
  const file = await File.findOne({ _id: fileId, userId });
  if (!file) throw new AppError('File not found', 404);

  const oldName = file.name;
  file.name = name;
  await file.save();

  await logActivity(userId, 'renamed', file.isFolder ? 'folder' : 'file', file._id, name, { oldName });
  return file;
};

export const deleteFile = async (userId: string, fileId: string, permanent = false) => {
  const file = await File.findOne({ _id: fileId, userId });
  if (!file) throw new AppError('File not found', 404);

  if (permanent) {
    if (!file.isFolder) {
      await deleteStoredFile(file.s3Key, file.storageType, userId);
    } else {
      const children = await File.find({ userId, folderId: file._id });
      for (const child of children) {
        await deleteFile(userId, child._id.toString(), true);
      }
    }
    await File.deleteOne({ _id: fileId });
    await logActivity(userId, 'permanently_deleted', file.isFolder ? 'folder' : 'file', file._id, file.name);
    return { message: 'Permanently deleted' };
  }

  file.isTrashed = true;
  file.trashedAt = new Date();
  await file.save();
  await logActivity(userId, 'trashed', file.isFolder ? 'folder' : 'file', file._id, file.name);
  return file;
};

export const restoreFile = async (userId: string, fileId: string) => {
  const file = await File.findOne({ _id: fileId, userId, isTrashed: true });
  if (!file) throw new AppError('File not found in trash', 404);

  file.isTrashed = false;
  file.trashedAt = undefined;
  await file.save();
  await logActivity(userId, 'restored', file.isFolder ? 'folder' : 'file', file._id, file.name);
  return file;
};

export const moveFile = async (userId: string, fileId: string, targetFolderId: string | null) => {
  const file = await File.findOne({ _id: fileId, userId, isTrashed: false });
  if (!file) throw new AppError('File not found', 404);

  if (targetFolderId) {
    const target = await File.findOne({ _id: targetFolderId, userId, isFolder: true });
    if (!target) throw new AppError('Target folder not found', 404);
    file.folderId = target._id;
    file.parentPath = `${target.parentPath}${target.name}/`;
  } else {
    file.folderId = null;
    file.parentPath = '/';
  }

  await file.save();
  await logActivity(userId, 'moved', file.isFolder ? 'folder' : 'file', file._id, file.name, { targetFolderId });
  return file;
};

export const copyFile = async (userId: string, fileId: string, targetFolderId?: string | null) => {
  const file = await File.findOne({ _id: fileId, userId, isTrashed: false, isFolder: false });
  if (!file) throw new AppError('File not found', 404);

  const copy = await File.create({
    userId,
    name: `Copy of ${file.name}`,
    originalName: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
    s3Key: file.s3Key,
    s3Url: file.s3Url,
    storageType: file.storageType,
    folderId: targetFolderId ?? file.folderId,
    parentPath: file.parentPath,
    tags: [...file.tags],
    category: file.category,
    copiedFrom: file._id,
  });

  await logActivity(userId, 'copied', 'file', copy._id, copy.name, { sourceId: fileId });
  return copy;
};

export const toggleFavorite = async (userId: string, fileId: string) => {
  const file = await File.findOne({ _id: fileId, userId, isTrashed: false });
  if (!file) throw new AppError('File not found', 404);

  file.isFavorite = !file.isFavorite;
  await file.save();
  return file;
};

export const getDownloadUrl = async (userId: string, fileId: string) => {
  const file = await File.findOne({ _id: fileId, userId, isFolder: false });
  if (!file) throw new AppError('File not found', 404);

  const url = await getPresignedDownloadUrl(file.s3Key, file.storageType, userId, file.originalName);
  await logActivity(userId, 'downloaded', 'file', file._id, file.name);
  return { url, name: file.originalName, mimeType: file.mimeType };
};

// Inline view URL for previews — unlike getDownloadUrl this serves the file inline
// (Content-Disposition: inline) so PDFs/images render in the browser instead of downloading,
// and it does not log a "downloaded" activity for every preview.
export const getPreviewUrl = async (userId: string, fileId: string) => {
  const file = await File.findOne({ _id: fileId, userId, isFolder: false });
  if (!file) throw new AppError('File not found', 404);

  const url = await getPresignedViewUrl(file.s3Key, file.storageType, userId);
  return { url, name: file.originalName, mimeType: file.mimeType };
};

export const getPresignedUpload = async (userId: string, fileName: string, mimeType: string) => {
  validateFile(mimeType, 1);
  const result = await getPresignedUploadUrl(userId, fileName, mimeType);
  if (!result) throw new AppError('S3 not configured. Use direct upload instead.', 400);
  return result;
};

export const confirmPresignedUpload = async (
  userId: string,
  data: { key: string; originalName: string; mimeType: string; size: number; folderId?: string; category?: FileCategory }
) => {
  validateFile(data.mimeType, data.size);
  await assertStorageQuota(userId, data.size);
  const doc = await File.create({
    userId,
    name: data.originalName,
    originalName: data.originalName,
    mimeType: data.mimeType,
    size: data.size,
    s3Key: data.key,
    s3Url: `s3://${process.env.AWS_S3_BUCKET}/${data.key}`,
    storageType: 's3',
    folderId: data.folderId || null,
    category: data.category || 'personal',
  });
  await logActivity(userId, 'uploaded', 'file', doc._id, data.originalName);
  return doc;
};

export const getDashboardStats = async (userId: string) => {
  const baseFilter = { userId, isTrashed: false, isFolder: false };

  const [
    totalFiles,
    totalImages,
    totalDocuments,
    favoriteCount,
    recentUploads,
    categoryAgg,
    cardSummary,
    storageUsage,
  ] = await Promise.all([
    File.countDocuments(baseFilter),
    File.countDocuments({ ...baseFilter, mimeType: { $regex: '^image/' } }),
    File.countDocuments({ ...baseFilter, mimeType: { $in: DOCUMENT_MIME_TYPES } }),
    File.countDocuments({ ...baseFilter, isFavorite: true }),
    File.find(baseFilter).sort({ createdAt: -1 }).limit(5),
    File.aggregate([
      { $match: baseFilter },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]),
    getDashboardCardSummary(userId, 3),
    getUserStorageUsage(userId),
  ]);

  return {
    totalFiles,
    totalImages,
    totalDocuments,
    totalCards: cardSummary.totalCards,
    favoriteCount,
    recentUploads,
    recentCards: cardSummary.recentCards,
    storageUsed: storageUsage.totalBytes,
    storageUsedFiles: storageUsage.filesBytes,
    storageUsedCards: storageUsage.cardsBytes,
    storageLimit: storageUsage.limitBytes,
    storagePercentage: storageUsage.percentage,
    categoryBreakdown: categoryAgg.map((row: { _id: string; count: number }) => ({
      category: row._id,
      count: row.count,
    })),
  };
};

export const getImages = async (userId: string, page = 1, limit = 24) => {
  const filter = { userId, isTrashed: false, isFolder: false, mimeType: { $regex: '^image/' } };
  const skip = (page - 1) * limit;
  const [images, total] = await Promise.all([
    File.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    File.countDocuments(filter),
  ]);
  return { images, total, page, totalPages: Math.ceil(total / limit) };
};

export const updateFileMetadata = async (
  userId: string,
  fileId: string,
  data: { tags?: string[]; category?: FileCategory; customCategory?: string }
) => {
  const file = await File.findOne({ _id: fileId, userId });
  if (!file) throw new AppError('File not found', 404);

  if (data.tags) file.tags = data.tags;
  if (data.category) file.category = data.category;
  if (data.customCategory !== undefined) file.customCategory = data.customCategory;
  await file.save();
  return file;
};

export const getFileById = async (userId: string, fileId: string) => {
  const file = await File.findOne({ _id: fileId, userId });
  if (!file) throw new AppError('File not found', 404);
  return file;
};

export const getFileExtension = (name: string): string => path.extname(name).toLowerCase();
