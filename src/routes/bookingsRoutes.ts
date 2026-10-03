import { Router } from 'express';
import { validateCheckout, confirmBooking, getUserBookings, getBookingById, cancelBooking } from '../controllers/bookingsController.js';
import { authenticateJWT, optionalAuthenticateJWT } from '../middleware/authMiddleware.js';

const router = Router();

router.post('/validate', optionalAuthenticateJWT, validateCheckout);
router.post('/confirm', authenticateJWT, confirmBooking);
router.get('/', authenticateJWT, getUserBookings);
router.get('/:id', authenticateJWT, getBookingById);
router.post('/:id/cancel', authenticateJWT, cancelBooking);

export default router;
