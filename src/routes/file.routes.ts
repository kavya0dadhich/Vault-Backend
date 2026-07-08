import { Router } from 'express';
import multer from 'multer';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as fileController from '../controllers/file.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

router.use(authenticate);

router.get('/dashboard', fileController.getDashboard);
router.get('/files', fileController.getFiles);
router.get('/files/search', fileController.searchFiles);
router.get('/files/images', fileController.getImages);
router.get('/files/local/:userId/:fileName', fileController.serveLocalFile);
router.get('/files/:id', fileController.getFile);
router.get('/files/:id/download', fileController.downloadFile);
router.get('/files/:id/preview', fileController.previewFile);
router.get('/files/:id/raw', fileController.rawFile);
router.post('/files/upload', upload.array('files', 20), fileController.uploadFiles);
router.post('/files/folder', body('name').trim().notEmpty(), validate, fileController.createFolder);
router.post('/files/presigned-upload', fileController.getPresignedUpload);
router.post('/files/confirm-upload', fileController.confirmUpload);
router.patch('/files/:id/rename', body('name').trim().notEmpty(), validate, fileController.renameFile);
router.patch('/files/:id/move', fileController.moveFile);
router.post('/files/:id/copy', fileController.copyFile);
router.patch('/files/:id/favorite', fileController.toggleFavorite);
router.patch('/files/:id/metadata', fileController.updateMetadata);
router.delete('/files/:id', fileController.deleteFile);
router.post('/files/:id/restore', fileController.restoreFile);

export default router;
