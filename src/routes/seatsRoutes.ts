import { Router } from 'express';
import { getShowSeats, lockSeats, unlockSeats } from '../controllers/seatsController.js';

const router = Router();

router.get('/:showId', getShowSeats);
router.post('/lock', lockSeats);
router.post('/unlock', unlockSeats);
router.delete('/lock', unlockSeats);

export default router;
