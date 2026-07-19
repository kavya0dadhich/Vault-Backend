import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as familyService from '../services/family.service';
import { getFileStream } from '../services/storage.service';

const param = (value: string | string[]): string => (Array.isArray(value) ? value[0] : value);

export const sendRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  const link = await familyService.sendFamilyRequest(req.userId!, req.body.email);
  res.status(201).json({ link });
};

export const listLinks = async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await familyService.listFamilyLinks(req.userId!);
  res.json(result);
};

export const respond = async (req: AuthRequest, res: Response): Promise<void> => {
  const link = await familyService.respondToFamilyRequest(req.userId!, param(req.params.id), req.body.decision);
  res.json({ link });
};

export const verifyOtp = async (req: AuthRequest, res: Response): Promise<void> => {
  const link = await familyService.verifyFamilyOtp(req.userId!, param(req.params.id), req.body.otp);
  res.json({ link });
};

export const resendOtp = async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await familyService.resendFamilyOtp(req.userId!, param(req.params.id));
  res.json(result);
};

export const revoke = async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await familyService.revokeFamilyLink(req.userId!, param(req.params.id));
  res.json(result);
};

export const getMemberFiles = async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await familyService.getFamilyMemberFiles(req.userId!, param(req.params.id), {
    folderId: req.query.folderId as string | undefined,
    category: req.query.category as string,
    page: parseInt(req.query.page as string) || 1,
    limit: parseInt(req.query.limit as string) || 20,
    sortBy: req.query.sortBy as string,
    sortOrder: req.query.sortOrder as 'asc' | 'desc',
  });
  res.json(result);
};

export const searchMemberFiles = async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await familyService.searchFamilyMemberFiles(req.userId!, param(req.params.id), {
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

export const getMemberImages = async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await familyService.getFamilyMemberImages(
    req.userId!,
    param(req.params.id),
    parseInt(req.query.page as string) || 1,
    parseInt(req.query.limit as string) || 24
  );
  res.json(result);
};

export const getMemberFile = async (req: AuthRequest, res: Response): Promise<void> => {
  const file = await familyService.getFamilyMemberFile(req.userId!, param(req.params.id), param(req.params.fileId));
  res.json({ file });
};

export const downloadMemberFile = async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await familyService.getFamilyMemberFileDownload(
    req.userId!,
    param(req.params.id),
    param(req.params.fileId)
  );
  res.json(result);
};

export const previewMemberFile = async (req: AuthRequest, res: Response): Promise<void> => {
  const file = await familyService.getFamilyMemberFile(req.userId!, param(req.params.id), param(req.params.fileId));
  const result = await familyService.getFamilyMemberFilePreview(
    req.userId!,
    param(req.params.id),
    param(req.params.fileId)
  );
  res.json({ ...result, file });
};

export const rawMemberFile = async (req: AuthRequest, res: Response): Promise<void> => {
  const file = await familyService.getFamilyMemberFile(req.userId!, param(req.params.id), param(req.params.fileId));
  const stream = await getFileStream(file.s3Key, file.storageType, file.userId.toString());
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalName)}"`);
  stream.on('error', () => {
    if (!res.headersSent) res.status(404).json({ message: 'File not found' });
  });
  stream.pipe(res);
};

export const getMemberCards = async (req: AuthRequest, res: Response): Promise<void> => {
  const cards = await familyService.getFamilyMemberCards(req.userId!, param(req.params.id));
  res.json({ cards });
};
