// Google auth removed - this file kept as a harmless stub to avoid import errors.
import express from 'express';
const router = express.Router();
router.get('/', (_req, res) => res.status(410).json({ message: 'Google auth removed' }));
export default router;
