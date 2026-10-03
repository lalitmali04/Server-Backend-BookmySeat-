import { Router } from 'express';
import { register, login, getProfile } from '../controllers/authController.js';
import { authenticateJWT } from '../middleware/authMiddleware.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/profile', authenticateJWT, getProfile);
router.get('/me', authenticateJWT, getProfile);

export default router;
