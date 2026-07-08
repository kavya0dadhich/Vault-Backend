import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import * as cardService from '../services/card.service';
import { CardGradient } from '../models/Card';

const param = (value: string | string[]): string => (Array.isArray(value) ? value[0] : value);

type CardFiles = { front?: Express.Multer.File[]; back?: Express.Multer.File[] };

export const createCard = async (req: AuthRequest, res: Response): Promise<void> => {
  const files = req.files as CardFiles | undefined;
  const front = files?.front?.[0];
  if (!front) throw new AppError('Front image is required', 400);

  const { name, gradient } = req.body;
  if (!name?.trim()) throw new AppError('Card name is required', 400);

  const card = await cardService.createCard(
    req.userId!,
    name.trim(),
    (gradient as CardGradient) || 'ocean',
    front,
    files?.back?.[0]
  );
  res.status(201).json({ card });
};

export const listCards = async (req: AuthRequest, res: Response): Promise<void> => {
  const cards = await cardService.listCards(req.userId!);
  res.json({ cards });
};

export const renameCard = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.body.name?.trim()) throw new AppError('Card name is required', 400);
  const card = await cardService.renameCard(req.userId!, param(req.params.id), req.body.name.trim());
  res.json({ card });
};

export const deleteCard = async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await cardService.deleteCard(req.userId!, param(req.params.id));
  res.json(result);
};
