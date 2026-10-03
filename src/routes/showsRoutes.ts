import { Router } from 'express';
import { getShowsForMovieAndDate } from '../controllers/showsController.js';

const router = Router();
router.get('/', getShowsForMovieAndDate);

export default router;
