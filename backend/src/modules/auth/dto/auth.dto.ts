import { z } from 'zod';
import { envelopeSchema } from '../../../common/envelope.js';
import { publicUserSchema } from '../../users/dto/user.dto.js';

/**
 * T14 — auth request/response contract. The backend owns the shape, so these
 * schemas ARE the contract: `openapi.json` is generated from them.
 */

const emailSchema = z.email().trim().toLowerCase().max(254);

export const registerSchema = z.object({
  email: emailSchema,
  /** Argon2id has no 72-byte truncation, but an unbounded password is a DoS vector. */
  password: z.string().min(8).max(256),
  name: z.string().trim().min(1).max(100),
  /** True promotes the new account to HOST, otherwise it is a GUEST. */
  wantsToHost: z.boolean().default(false),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
});

export type LoginInput = z.infer<typeof loginSchema>;

const authUserSchema = publicUserSchema;

const authDataSchema = z.object({
  user: authUserSchema,
  /** The same JWT that was set as the httpOnly cookie, for non-browser clients. */
  token: z.string(),
});

const meDataSchema = z.object({ user: authUserSchema });

export const authEnvelopeSchema = envelopeSchema(authDataSchema);
export const meEnvelopeSchema = envelopeSchema(meDataSchema);

export type AuthData = z.infer<typeof authDataSchema>;
export type MeData = z.infer<typeof meDataSchema>;

/**
 * Named so the OpenAPI components are stable identifiers. The user shape itself
 * is the users module's `AuthUser` component — referenced here, registered
 * there — so the document has exactly one user type.
 */
export const DTO_SCHEMAS = {
  AuthData: authDataSchema,
  AuthEnvelope: authEnvelopeSchema,
  MeData: meDataSchema,
  MeEnvelope: meEnvelopeSchema,
} as const satisfies Record<string, z.ZodType>;
