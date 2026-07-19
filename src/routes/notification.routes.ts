import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as notificationController from '../controllers/notification.controller';

const router = Router();

router.use(authenticate);

router.get('/', notificationController.listNotifications);
router.patch('/read-all', notificationController.markAllRead);
router.patch('/:id/read', notificationController.markRead);

export default router;
