import { Response } from 'express';
import fs from 'fs';
import { AuthRequest } from '../middleware/auth';
import * as fileService from '../services/file.service';
import { getLocalFilePath, getFileStream } from '../services/storage.service';
import { AppError } from '../middleware/errorHandler';

const param = (value: string | string[]): string => (Array.isArray(value) ? value[0] : value);

export const uploadFiles = async (req: AuthRequest, res: Response): Promise<void> => {
  const files = req.files as Express.Multer.File[];
  if (!files?.length) {
    res.status(400).json({ message: 'No files uploaded' });
    return;
  }

  const { folderId, category, tags, names } = req.body;
  const parsedTags = tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : [];
  const parsedNames = names
    ? (typeof names === 'string' ? JSON.parse(names) : names)
    : undefined;
  const results = await fileService.uploadFiles(req.userId!, files, {
    folderId,
    category,
    tags: parsedTags,
    names: Array.isArray(parsedNames) ? parsedNames : undefined,
  });
  res.status(201).json({ files: results });
};

export const createFolder = async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, folderId } = req.body;
  const folder = await fileService.createFolder(req.userId!, name, folderId);
  res.status(201).json({ folder });
};

export const getFiles = async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await fileService.getFiles(req.userId!, {
    folderId: req.query.folderId as string | undefined,
    isTrashed: req.query.trashed === 'true',
    isFavorite: req.query.favorite === 'true',
    category: req.query.category as string,
    page: parseInt(req.query.page as string) || 1,
    limit: parseInt(req.query.limit as string) || 20,
    sortBy: req.query.sortBy as string,
    sortOrder: req.query.sortOrder as 'asc' | 'desc',
  });
  res.json(result);
};

export const searchFiles = async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await fileService.searchFiles(req.userId!, {
    q: req.query.q as string,
    tags: req.query.tags as string,
    fileType: req.query.fileType as string,
    category: req.query.category as string,
    folderId: req.query.folderId as string,
    dateFrom: req.query.dateFrom as string,
    dateTo: req.query.dateTo as string,
    page: parseInt(req.query.page as string) || 1,
    limit: parseInt(req.query.limit as string) || 20,
  });
  res.json(result);
};

export const getFile = async (req: AuthRequest, res: Response): Promise<void> => {
  const file = await fileService.getFileById(req.userId!, param(req.params.id));
  res.json({ file });
};

export const renameFile = async (req: AuthRequest, res: Response): Promise<void> => {
  const file = await fileService.renameFile(req.userId!, param(req.params.id), req.body.name);
  res.json({ file });
};

export const deleteFile = async (req: AuthRequest, res: Response): Promise<void> => {
  const permanent = req.query.permanent === 'true';
  const result = await fileService.deleteFile(req.userId!, param(req.params.id), permanent);
  res.json(result);
};

export const restoreFile = async (req: AuthRequest, res: Response): Promise<void> => {
  const file = await fileService.restoreFile(req.userId!, param(req.params.id));
  res.json({ file });
};

export const moveFile = async (req: AuthRequest, res: Response): Promise<void> => {
  const file = await fileService.moveFile(req.userId!, param(req.params.id), req.body.folderId ?? null);
  res.json({ file });
};

export const copyFile = async (req: AuthRequest, res: Response): Promise<void> => {
  const file = await fileService.copyFile(req.userId!, param(req.params.id), req.body.folderId);
  res.json({ file });
};

export const toggleFavorite = async (req: AuthRequest, res: Response): Promise<void> => {
  const file = await fileService.toggleFavorite(req.userId!, param(req.params.id));
  res.json({ file });
};

export const downloadFile = async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await fileService.getDownloadUrl(req.userId!, param(req.params.id));
  res.json(result);
};

export const getPresignedUpload = async (req: AuthRequest, res: Response): Promise<void> => {
  const { fileName, mimeType } = req.body;
  const result = await fileService.getPresignedUpload(req.userId!, fileName, mimeType);
  res.json(result);
};

export const confirmUpload = async (req: AuthRequest, res: Response): Promise<void> => {
  const file = await fileService.confirmPresignedUpload(req.userId!, req.body);
  res.status(201).json({ file });
};

export const getDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
  const stats = await fileService.getDashboardStats(req.userId!);
  res.json(stats);
};

export const getImages = async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await fileService.getImages(
    req.userId!,
    parseInt(req.query.page as string) || 1,
    parseInt(req.query.limit as string) || 24
  );
  res.json(result);
};

export const updateMetadata = async (req: AuthRequest, res: Response): Promise<void> => {
  const file = await fileService.updateFileMetadata(req.userId!, param(req.params.id), req.body);
  res.json({ file });
};

export const serveLocalFile = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = param(req.params.userId);
  const fileName = param(req.params.fileName);
  if (userId !== req.userId) throw new AppError('Access denied', 403);

  const filePath = getLocalFilePath(userId, fileName);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ message: 'File not found' });
    return;
  }

  const { File } = await import('../models/File');
  const match = await File.findOne({
    userId: req.userId,
    s3Key: { $regex: fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') },
    storageType: 'local',
  });

  if (match) {
    res.setHeader('Content-Type', match.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${match.originalName}"`);
  }

  fs.createReadStream(filePath).pipe(res);
};

export const previewFile = async (req: AuthRequest, res: Response): Promise<void> => {
  const file = await fileService.getFileById(req.userId!, param(req.params.id));
  if (file.isFolder) throw new AppError('Cannot preview a folder', 400);

  const result = await fileService.getPreviewUrl(req.userId!, param(req.params.id));
  res.json({ ...result, file });
};

// Streams the raw file bytes inline through our own origin. Used by the client to parse
// spreadsheets/text for in-app preview without hitting S3 cross-origin (CORS) restrictions.
export const rawFile = async (req: AuthRequest, res: Response): Promise<void> => {
  const file = await fileService.getFileById(req.userId!, param(req.params.id));
  if (file.isFolder) throw new AppError('Cannot stream a folder', 400);

  const stream = await getFileStream(file.s3Key, file.storageType, req.userId!);
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalName)}"`);
  stream.on('error', () => {
    if (!res.headersSent) res.status(404).json({ message: 'File not found' });
  });
  stream.pipe(res);
};
