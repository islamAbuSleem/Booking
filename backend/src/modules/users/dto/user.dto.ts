import { z } from 'zod';

/**
 * T14 — the public user shape. The password hash, the OAuth tuple and the
 * timestamps never leave the API: what the client gets is identity + role.
 */

export const publicUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  role: z.enum(['GUEST', 'HOST', 'ADMIN']),
});

export type PublicUser = z.infer<typeof publicUserSchema>;

export function toPublicUser(user: {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: 'GUEST' | 'HOST' | 'ADMIN';
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
  };
}

export const DTO_SCHEMAS = {
  AuthUser: publicUserSchema,
} as const satisfies Record<string, z.ZodType>;
