import { Router } from 'express';
import {
  createKit,
  getUserKits,
  getKitById,
  updateKit,
  deleteKit
} from '../controllers/kit.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

// All kit routes require authentication (Section 1)
router.use(verifyJWT);

router.route('/').post(createKit).get(getUserKits);
router.route('/:id').get(getKitById).put(updateKit).delete(deleteKit);

export default router;