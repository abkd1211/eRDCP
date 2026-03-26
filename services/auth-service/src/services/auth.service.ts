import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import prisma from '../config/prisma';
import redisClient, { REDIS_KEYS, REDIS_TTL } from '../config/redis';
import { env } from '../config/env';
import logger from '../config/logger';
import {
  generateTokenPair,
  verifyRefreshToken,
  getRefreshTokenExpiry,
  decodeToken,
} from '../utils/jwt';
import {
  RegisterDto,
  LoginDto,
  TokenPair,
  UserProfile,
} from '../types';

export class AuthService {

  // ─── Register ───────────────────────────────────────────────────────────────
  async register(dto: RegisterDto, ipAddress?: string): Promise<{ user: UserProfile; tokens: TokenPair }> {
    // Check for existing user
    const existing = await prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw Object.assign(new Error('Email already registered'), { code: 'EMAIL_EXISTS', status: 409 });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, env.BCRYPT_SALT_ROUNDS);

    // Create user
    const user = await prisma.user.create({
      data: { name: dto.name, email: dto.email, passwordHash, role: dto.role },
    });

    // Generate tokens
    const tokens = generateTokenPair(user.id, user.email, user.role);

    // Store refresh token
    await prisma.refreshToken.create({
      data: {
        userId:    user.id,
        token:     tokens.refreshToken,
        expiresAt: getRefreshTokenExpiry(),
      },
    });

    // Audit log
    await this.createAuditLog(user.id, 'USER_REGISTERED', ipAddress);

    logger.info('User registered', { userId: user.id, email: user.email, role: user.role });

    return { user: this.toProfile(user), tokens };
  }

  // ─── Login ───────────────────────────────────────────────────────────────────
  async login(dto: LoginDto, ipAddress?: string): Promise<{ user: UserProfile; tokens: TokenPair }> {
    // Find user
    const user = await prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.isActive) {
      throw Object.assign(new Error('Invalid email or password'), { code: 'INVALID_CREDENTIALS', status: 401 });
    }

    // Check password
    const isValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValid) {
      throw Object.assign(new Error('Invalid email or password'), { code: 'INVALID_CREDENTIALS', status: 401 });
    }

    // Generate tokens
    const tokens = generateTokenPair(user.id, user.email, user.role);

    // Store refresh token
    await prisma.refreshToken.create({
      data: {
        userId:    user.id,
        token:     tokens.refreshToken,
        expiresAt: getRefreshTokenExpiry(),
      },
    });

    // Cache user profile in Redis
    await redisClient.setEx(
      REDIS_KEYS.userProfile(user.id),
      REDIS_TTL.userProfile,
      JSON.stringify(this.toProfile(user))
    );

    // Audit log
    await this.createAuditLog(user.id, 'USER_LOGIN', ipAddress);

    logger.info('User logged in', { userId: user.id, email: user.email });

    return { user: this.toProfile(user), tokens };
  }

  // ─── Refresh Tokens ──────────────────────────────────────────────────────────
  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    // Verify the token signature
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw Object.assign(new Error('Invalid or expired refresh token'), { code: 'INVALID_TOKEN', status: 401 });
    }

    // Find in DB (must exist and not be revoked)
    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw Object.assign(new Error('Refresh token is invalid or has been revoked'), { code: 'TOKEN_REVOKED', status: 401 });
    }

    // Get user
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw Object.assign(new Error('User not found or inactive'), { code: 'USER_NOT_FOUND', status: 401 });
    }

    // Rotate: revoke old, issue new
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });

    const tokens = generateTokenPair(user.id, user.email, user.role);
    await prisma.refreshToken.create({
      data: { userId: user.id, token: tokens.refreshToken, expiresAt: getRefreshTokenExpiry() },
    });

    logger.info('Tokens refreshed', { userId: user.id });
    return tokens;
  }

  // ─── Logout ──────────────────────────────────────────────────────────────────
  async logout(userId: string, accessToken: string, refreshToken?: string, ipAddress?: string): Promise<void> {
    // Blacklist the access token in Redis until it naturally expires
    const decoded = decodeToken(accessToken);
    if (decoded?.jti && decoded?.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await redisClient.setEx(REDIS_KEYS.blacklistedToken(decoded.jti), ttl, '1');
      }
    }

    // Revoke refresh token if provided
    if (refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { userId, token: refreshToken },
        data:  { revoked: true },
      });
    }

    // Clear cached profile
    await redisClient.del(REDIS_KEYS.userProfile(userId));

    // Audit log
    await this.createAuditLog(userId, 'USER_LOGOUT', ipAddress);

    logger.info('User logged out', { userId });
  }

  // ─── Get Profile ─────────────────────────────────────────────────────────────
  async getProfile(userId: string): Promise<UserProfile> {
    // Try cache first
    const cached = await redisClient.get(REDIS_KEYS.userProfile(userId));
    if (cached) return JSON.parse(cached) as UserProfile;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw Object.assign(new Error('User not found'), { code: 'USER_NOT_FOUND', status: 404 });
    }

    const profile = this.toProfile(user);
    await redisClient.setEx(REDIS_KEYS.userProfile(userId), REDIS_TTL.userProfile, JSON.stringify(profile));

    return profile;
  }

  // ─── Update Profile ───────────────────────────────────────────────────────────
  async updateProfile(
    userId: string,
    data: { name?: string; currentPassword?: string; newPassword?: string }
  ): Promise<UserProfile> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw Object.assign(new Error('User not found'), { code: 'USER_NOT_FOUND', status: 404 });
    }

    const updateData: { name?: string; passwordHash?: string } = {};

    if (data.name) updateData.name = data.name;

    if (data.newPassword && data.currentPassword) {
      const isValid = await bcrypt.compare(data.currentPassword, user.passwordHash);
      if (!isValid) {
        throw Object.assign(new Error('Current password is incorrect'), { code: 'INVALID_PASSWORD', status: 400 });
      }
      updateData.passwordHash = await bcrypt.hash(data.newPassword, env.BCRYPT_SALT_ROUNDS);
    }

    const updated = await prisma.user.update({ where: { id: userId }, data: updateData });

    // Invalidate cache
    await redisClient.del(REDIS_KEYS.userProfile(userId));

    logger.info('Profile updated', { userId });
    return this.toProfile(updated);
  }

  // ─── List Users (admin) ───────────────────────────────────────────────────────
  async listUsers(page = 1, limit = 20): Promise<{ users: UserProfile[]; total: number; page: number; pages: number }> {
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      prisma.user.findMany({ skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.user.count(),
    ]);
    return { users: users.map(this.toProfile), total, page, pages: Math.ceil(total / limit) };
  }

  // ─── Update Role (admin) ──────────────────────────────────────────────────────
  async updateRole(targetUserId: string, role: Role): Promise<UserProfile> {
    const user = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) {
      throw Object.assign(new Error('User not found'), { code: 'USER_NOT_FOUND', status: 404 });
    }
    const updated = await prisma.user.update({ where: { id: targetUserId }, data: { role } });
    await redisClient.del(REDIS_KEYS.userProfile(targetUserId));
    logger.info('User role updated', { targetUserId, role });
    return this.toProfile(updated);
  }

  // ─── Deactivate User (admin) ──────────────────────────────────────────────────
  async deactivateUser(targetUserId: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) {
      throw Object.assign(new Error('User not found'), { code: 'USER_NOT_FOUND', status: 404 });
    }
    await prisma.user.update({ where: { id: targetUserId }, data: { isActive: false } });
    // Revoke all refresh tokens
    await prisma.refreshToken.updateMany({ where: { userId: targetUserId }, data: { revoked: true } });
    await redisClient.del(REDIS_KEYS.userProfile(targetUserId));
    logger.info('User deactivated', { targetUserId });
  }

  // ─── Verify Token (for API Gateway) ──────────────────────────────────────────
  async verifyToken(token: string): Promise<{ valid: boolean; payload?: { sub: string; email: string; role: Role; jti: string } }> {
    try {
      const { verifyAccessToken } = await import('../utils/jwt');
      const payload = verifyAccessToken(token);

      // Check blacklist
      const blacklisted = await redisClient.get(REDIS_KEYS.blacklistedToken(payload.jti));
      if (blacklisted) return { valid: false };

      return { valid: true, payload: { sub: payload.sub, email: payload.email, role: payload.role, jti: payload.jti } };
    } catch {
      return { valid: false };
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────────
  private toProfile(user: { id: string; name: string; email: string; role: Role; isActive: boolean; createdAt: Date; updatedAt: Date }): UserProfile {
    return {
      id:        user.id,
      name:      user.name,
      email:     user.email,
      role:      user.role,
      isActive:  user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private async createAuditLog(userId: string, action: string, ipAddress?: string): Promise<void> {
    try {
      await prisma.auditLog.create({ data: { userId, action, ipAddress } });
    } catch (err) {
      logger.warn('Failed to create audit log', { userId, action, error: err });
    }
  }
}

export default new AuthService();
