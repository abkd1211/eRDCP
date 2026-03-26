import { Router } from 'express';
import authController from '../controllers/auth.controller';
import { authenticate, authorise, internalAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { authLimiter } from '../middleware/rateLimit.middleware';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  updateProfileSchema,
  updateRoleSchema,
  verifyTokenSchema,
} from '../validators/auth.validators';
import { Role } from '@prisma/client';

const router = Router();

// ─── Public Routes ────────────────────────────────────────────────────────────
router.post('/register',      authLimiter, validate(registerSchema),      authController.register);
router.post('/login',         authLimiter, validate(loginSchema),         authController.login);
router.post('/refresh-token',             validate(refreshTokenSchema),   authController.refreshToken);

// ─── Protected Routes ─────────────────────────────────────────────────────────
router.post('/logout',  authenticate, authController.logout);
router.get( '/profile', authenticate, authController.getProfile);
router.put( '/profile', authenticate, validate(updateProfileSchema), authController.updateProfile);

// ─── Admin Routes (SYSTEM_ADMIN only) ────────────────────────────────────────
router.get(    '/users',          authenticate, authorise(Role.SYSTEM_ADMIN), authController.listUsers);
router.put(    '/users/:id/role', authenticate, authorise(Role.SYSTEM_ADMIN), validate(updateRoleSchema), authController.updateRole);
router.delete( '/users/:id',      authenticate, authorise(Role.SYSTEM_ADMIN), authController.deactivateUser);

// ─── Internal Route (API Gateway only) ───────────────────────────────────────
router.post('/verify-token', internalAuth, validate(verifyTokenSchema), authController.verifyToken);

export default router;
