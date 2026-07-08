import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import * as cardController from '../controllers/card.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

router.use(authenticate);

router.get('/', cardController.listCards);
router.post(
  '/',
  upload.fields([
    { name: 'front', maxCount: 1 },
    { name: 'back', maxCount: 1 },
  ]),
  cardController.createCard
);
router.patch('/:id', cardController.renameCard);
router.delete('/:id', cardController.deleteCard);

export default router;
