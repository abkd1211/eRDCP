import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { Role } from '@prisma/client';
import { env } from '../config/env';
import { JwtAccessPayload, JwtRefreshPayload, TokenPair } from '../types';

// ─── Generate Token Pair ──────────────────────────────────────────────────────
export const generateTokenPair = (userId: string, email: string, role: Role): TokenPair => {
  const accessJti  = uuidv4();
  const refreshJti = uuidv4();

  const accessPayload: JwtAccessPayload = { sub: userId, email, role, jti: accessJti };
  const refreshPayload: JwtRefreshPayload = { sub: userId, jti: refreshJti };

  const accessToken = jwt.sign(accessPayload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });

  const refreshToken = jwt.sign(refreshPayload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });

  return { accessToken, refreshToken, expiresIn: 15 * 60 };
};

// ─── Verify Access Token ──────────────────────────────────────────────────────
export const verifyAccessToken = (token: string): JwtAccessPayload => {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtAccessPayload;
};

// ─── Verify Refresh Token ─────────────────────────────────────────────────────
export const verifyRefreshToken = (token: string): JwtRefreshPayload => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtRefreshPayload;
};

// ─── Decode Without Verifying (for expiry checks) ────────────────────────────
export const decodeToken = (token: string): jwt.JwtPayload | null => {
  return jwt.decode(token) as jwt.JwtPayload | null;
};

// ─── Get Expiry in Seconds ────────────────────────────────────────────────────
export const getRefreshTokenExpiry = (): Date => {
  const days = parseInt(env.JWT_REFRESH_EXPIRES_IN.replace('d', ''), 10);
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};
