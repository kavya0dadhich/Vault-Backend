import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as familyController from '../controllers/family.controller';

const router = Router();

router.use(authenticate);

router.post('/request', body('email').isEmail().normalizeEmail(), validate, familyController.sendRequest);
router.get('/links', familyController.listLinks);
router.post(
  '/links/:id/respond',
  body('decision').isIn(['approve', 'reject']),
  validate,
  familyController.respond
);
router.post(
  '/links/:id/verify-otp',
  body('otp').isLength({ min: 6, max: 6 }).isNumeric(),
  validate,
  familyController.verifyOtp
);
router.post('/links/:id/resend-otp', familyController.resendOtp);
router.delete('/links/:id', familyController.revoke);

router.get('/links/:id/files', familyController.getMemberFiles);
router.get('/links/:id/files/search', familyController.searchMemberFiles);
router.get('/links/:id/files/images', familyController.getMemberImages);
router.get('/links/:id/files/:fileId', familyController.getMemberFile);
router.get('/links/:id/files/:fileId/download', familyController.downloadMemberFile);
router.get('/links/:id/files/:fileId/preview', familyController.previewMemberFile);
router.get('/links/:id/files/:fileId/raw', familyController.rawMemberFile);
router.get('/links/:id/cards', familyController.getMemberCards);

export default router;
