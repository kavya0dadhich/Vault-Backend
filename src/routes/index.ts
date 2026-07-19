import { Router } from 'express';
import authRoutes from './auth.routes';
import fileRoutes from './file.routes';
import cardRoutes from './card.routes';
import familyRoutes from './family.routes';
import notificationRoutes from './notification.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/cards', cardRoutes);
router.use('/family', familyRoutes);
router.use('/notifications', notificationRoutes);
router.use('/', fileRoutes);

export default router;
