import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as authController from '../controllers/auth.controller';

const router = Router();

router.post('/register', authController.registerValidation, validate, authController.register);
router.post('/login', authController.loginValidation, validate, authController.login);
router.post('/refresh', authController.refresh);
router.post('/forgot-password', body('email').isEmail(), validate, authController.forgotPassword);
router.post('/reset-password', body('password').isLength({ min: 8 }), validate, authController.resetPassword);

router.use(authenticate);
router.post('/logout', authController.logout);
router.get('/profile', authController.getProfile);
router.put('/profile', authController.updateProfile);
router.put('/settings', authController.updateSettings);
router.put('/change-password', authController.changePassword);

export default router;
