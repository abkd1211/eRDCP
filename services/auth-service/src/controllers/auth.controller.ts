import { Request, Response, NextFunction } from 'express';
import authService from '../services/auth.service';
import { sendSuccess, sendError } from '../utils/response';
import { AuthenticatedRequest } from '../types';
import { Role } from '@prisma/client';

export class AuthController {

  // POST /auth/register
  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ip = req.ip || req.socket.remoteAddress;
      const result = await authService.register(req.body, ip);
      sendSuccess(res, 201, 'Registration successful', result);
    } catch (err) {
      next(err);
    }
  };

  // POST /auth/login
  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ip = req.ip || req.socket.remoteAddress;
      const result = await authService.login(req.body, ip);
      sendSuccess(res, 200, 'Login successful', result);
    } catch (err) {
      next(err);
    }
  };

  // POST /auth/refresh-token
  refreshToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.body;
      const tokens = await authService.refreshTokens(refreshToken);
      sendSuccess(res, 200, 'Tokens refreshed', tokens);
    } catch (err) {
      next(err);
    }
  };

  // POST /auth/logout
  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const token = req.headers.authorization?.replace('Bearer ', '') ?? '';
      const { refreshToken } = req.body;
      const ip = req.ip || req.socket.remoteAddress;
      await authService.logout(authReq.user.id, token, refreshToken, ip);
      sendSuccess(res, 200, 'Logged out successfully', null);
    } catch (err) {
      next(err);
    }
  };

  // GET /auth/profile
  getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const profile = await authService.getProfile(authReq.user.id);
      sendSuccess(res, 200, 'Profile retrieved', profile);
    } catch (err) {
      next(err);
    }
  };

  // PUT /auth/profile
  updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const profile = await authService.updateProfile(authReq.user.id, req.body);
      sendSuccess(res, 200, 'Profile updated', profile);
    } catch (err) {
      next(err);
    }
  };

  // GET /auth/users  (SYSTEM_ADMIN only)
  listUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page  = parseInt(req.query.page  as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const result = await authService.listUsers(page, limit);
      sendSuccess(res, 200, 'Users retrieved', result);
    } catch (err) {
      next(err);
    }
  };

  // PUT /auth/users/:id/role  (SYSTEM_ADMIN only)
  updateRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const { role } = req.body as { role: Role };
      const user = await authService.updateRole(id, role);
      sendSuccess(res, 200, 'User role updated', user);
    } catch (err) {
      next(err);
    }
  };

  // DELETE /auth/users/:id  (SYSTEM_ADMIN only)
  deactivateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      await authService.deactivateUser(id);
      sendSuccess(res, 200, 'User deactivated', null);
    } catch (err) {
      next(err);
    }
  };

  // POST /auth/verify-token  (Internal — API Gateway use only)
  verifyToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token } = req.body;
      const result = await authService.verifyToken(token);
      sendSuccess(res, 200, result.valid ? 'Token valid' : 'Token invalid', result);
    } catch (err) {
      next(err);
    }
  };
}

export default new AuthController();
