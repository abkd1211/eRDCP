import { Role } from '@prisma/client';
import { Request } from 'express';

// ─── JWT Payload ──────────────────────────────────────────────────────────────
export interface JwtAccessPayload {
  sub:   string;   // user id
  email: string;
  role:  Role;
  jti:   string;   // unique token id (for blacklisting)
  iat?:  number;
  exp?:  number;
}

export interface JwtRefreshPayload {
  sub:   string;
  jti:   string;
  iat?:  number;
  exp?:  number;
}

// ─── Authenticated Request ────────────────────────────────────────────────────
export interface AuthenticatedRequest extends Request {
  user: {
    id:    string;
    email: string;
    role:  Role;
    jti:   string;
  };
}

// ─── API Response Shapes ──────────────────────────────────────────────────────
export interface ApiSuccess<T = unknown> {
  success: true;
  message: string;
  data:    T;
}

export interface ApiError {
  success: false;
  message: string;
  errors?: Record<string, string[]>;
  code?:   string;
}

// ─── Auth DTOs ────────────────────────────────────────────────────────────────
export interface RegisterDto {
  name:     string;
  email:    string;
  password: string;
  role:     Role;
}

export interface LoginDto {
  email:    string;
  password: string;
}

export interface TokenPair {
  accessToken:  string;
  refreshToken: string;
  expiresIn:    number;
}

export interface UserProfile {
  id:        string;
  name:      string;
  email:     string;
  role:      Role;
  isActive:  boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Re-export Prisma Role ────────────────────────────────────────────────────
export { Role };
