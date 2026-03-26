import { z } from 'zod';
import { Role } from '@prisma/client';

// ─── Register ─────────────────────────────────────────────────────────────────
export const registerSchema = z.object({
  body: z.object({
    name: z
      .string({ required_error: 'Name is required' })
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name must not exceed 100 characters')
      .trim(),
    email: z
      .string({ required_error: 'Email is required' })
      .email('Invalid email format')
      .toLowerCase()
      .trim(),
    password: z
      .string({ required_error: 'Password is required' })
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    role: z.nativeEnum(Role, {
      errorMap: () => ({
        message: `Role must be one of: ${Object.values(Role).join(', ')}`,
      }),
    }),
  }),
});

// ─── Login ────────────────────────────────────────────────────────────────────
export const loginSchema = z.object({
  body: z.object({
    email: z
      .string({ required_error: 'Email is required' })
      .email('Invalid email format')
      .toLowerCase()
      .trim(),
    password: z.string({ required_error: 'Password is required' }),
  }),
});

// ─── Refresh Token ────────────────────────────────────────────────────────────
export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string({ required_error: 'Refresh token is required' }),
  }),
});

// ─── Update Profile ───────────────────────────────────────────────────────────
export const updateProfileSchema = z.object({
  body: z.object({
    name: z
      .string()
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name must not exceed 100 characters')
      .trim()
      .optional(),
    currentPassword: z.string().optional(),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Must contain at least one number')
      .optional(),
  }).refine(
    (data) => {
      if (data.newPassword && !data.currentPassword) return false;
      return true;
    },
    { message: 'Current password is required to set a new password', path: ['currentPassword'] }
  ),
});

// ─── Update Role ──────────────────────────────────────────────────────────────
export const updateRoleSchema = z.object({
  body: z.object({
    role: z.nativeEnum(Role, {
      errorMap: () => ({
        message: `Role must be one of: ${Object.values(Role).join(', ')}`,
      }),
    }),
  }),
  params: z.object({
    id: z.string().uuid('Invalid user ID format'),
  }),
});

// ─── Verify Token (internal) ──────────────────────────────────────────────────
export const verifyTokenSchema = z.object({
  body: z.object({
    token: z.string({ required_error: 'Token is required' }),
  }),
});

export type RegisterInput    = z.infer<typeof registerSchema>['body'];
export type LoginInput       = z.infer<typeof loginSchema>['body'];
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>['body'];
