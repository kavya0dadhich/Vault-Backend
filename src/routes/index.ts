import { Router } from 'express';
import authRoutes from './auth.routes';
import fileRoutes from './file.routes';
import cardRoutes from './card.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/cards', cardRoutes);
router.use('/', fileRoutes);

export default router;
