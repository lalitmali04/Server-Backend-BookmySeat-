import { Router } from 'express';
import { getAnalytics, createMovie, deleteMovie, createShow, getAllBookings } from '../controllers/adminController.js';
import { authenticateJWT, requireAdmin } from '../middleware/authMiddleware.js';

const router = Router();

// Protect all admin routes
router.use(authenticateJWT, requireAdmin);

router.get('/analytics', getAnalytics);
router.post('/movies', createMovie);
router.delete('/movies/:id', deleteMovie);
router.post('/shows', createShow);
router.get('/bookings', getAllBookings);

export default router;
