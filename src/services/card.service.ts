import { Card, ICard, CardGradient } from '../models/Card';
import { Activity } from '../models/Activity';
import { uploadFile, deleteStoredFile, getPresignedViewUrl } from './storage.service';
import { assertStorageQuota } from './storage.quota.service';
import { AppError } from '../middleware/errorHandler';
import { enhanceCardImage } from '../utils/imageEnhance';

const CARD_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_CARD_IMAGE_SIZE = 15 * 1024 * 1024; // 15MB per side

const validateCardImage = (file: Express.Multer.File, side: string): void => {
  if (!CARD_IMAGE_TYPES.includes(file.mimetype)) {
    throw new AppError(`${side} image must be JPEG, PNG, WebP or GIF`, 400);
  }
  if (file.size > MAX_CARD_IMAGE_SIZE) {
    throw new AppError(`${side} image exceeds 15MB limit`, 400);
  }
};

const withUrls = async (card: ICard, userId: string) => ({
  _id: card._id,
  name: card.name,
  gradient: card.gradient,
  frontUrl: await getPresignedViewUrl(card.frontKey, card.storageType, userId),
  backUrl: card.backKey ? await getPresignedViewUrl(card.backKey, card.storageType, userId) : null,
  createdAt: card.createdAt,
  updatedAt: card.updatedAt,
});

export const createCard = async (
  userId: string,
  name: string,
  gradient: CardGradient,
  front: Express.Multer.File,
  back?: Express.Multer.File
) => {
  validateCardImage(front, 'Front');
  if (back) validateCardImage(back, 'Back');

  const frontBuffer = await enhanceCardImage(front.buffer, front.mimetype);
  const backBuffer = back ? await enhanceCardImage(back.buffer, back.mimetype) : null;

  const incomingBytes = frontBuffer.length + (backBuffer?.length ?? 0);
  await assertStorageQuota(userId, incomingBytes);

  const frontUpload = await uploadFile(userId, frontBuffer, front.originalname, front.mimetype);
  const backUpload = back && backBuffer
    ? await uploadFile(userId, backBuffer, back.originalname, back.mimetype)
    : null;

  const card = await Card.create({
    userId,
    name,
    gradient,
    frontKey: frontUpload.key,
    backKey: backUpload?.key,
    frontSize: frontBuffer.length,
    backSize: backBuffer?.length ?? 0,
    storageType: frontUpload.storageType,
  });

  await Activity.create({ userId, action: 'created_card', targetType: 'card', targetId: card._id, targetName: name });
  return withUrls(card, userId);
};

export const listCards = async (userId: string) => {
  const cards = await Card.find({ userId }).sort({ createdAt: -1 });
  return Promise.all(cards.map((c) => withUrls(c, userId)));
};

export const getDashboardCardSummary = async (userId: string, limit = 3) => {
  const [totalCards, recent] = await Promise.all([
    Card.countDocuments({ userId }),
    Card.find({ userId }).sort({ createdAt: -1 }).limit(limit),
  ]);
  const recentCards = await Promise.all(recent.map((c) => withUrls(c, userId)));
  return { totalCards, recentCards };
};

export const renameCard = async (userId: string, cardId: string, name: string) => {
  const card = await Card.findOne({ _id: cardId, userId });
  if (!card) throw new AppError('Card not found', 404);
  card.name = name;
  await card.save();
  return withUrls(card, userId);
};

export const deleteCard = async (userId: string, cardId: string) => {
  const card = await Card.findOne({ _id: cardId, userId });
  if (!card) throw new AppError('Card not found', 404);

  await deleteStoredFile(card.frontKey, card.storageType, userId);
  if (card.backKey) await deleteStoredFile(card.backKey, card.storageType, userId);
  await Card.deleteOne({ _id: card._id });

  await Activity.create({ userId, action: 'deleted_card', targetType: 'card', targetId: card._id, targetName: card.name });
  return { message: 'Card deleted' };
};
