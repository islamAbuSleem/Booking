import { z } from 'zod';
import { errorEnvelopeSchema } from '../common/envelope.js';
import { DTO_SCHEMAS as AVAILABILITY_DTO_SCHEMAS } from '../modules/bookings/dto/availability.dto.js';
import { DTO_SCHEMAS as AUTH_DTO_SCHEMAS } from '../modules/auth/dto/auth.dto.js';
import { DTO_SCHEMAS as FAVORITES_DTO_SCHEMAS } from '../modules/favorites/dto/favorite.dto.js';
import { DTO_SCHEMAS } from '../modules/hotels/dto/hotel.dto.js';
import { DTO_SCHEMAS as USER_DTO_SCHEMAS } from '../modules/users/dto/user.dto.js';

/**
 * T13a — every Zod schema that becomes a named OpenAPI component.
 *
 * One list, in one place. A schema that is not here is documented inline or not at all,
 * which is how a contract gap becomes visible.
 *
 * `ApiErrorEnvelope` is included because the error side of the envelope is part of the
 * contract even though no success route returns it.
 */
export const CONTRACT_SCHEMAS = {
  ApiErrorEnvelope: errorEnvelopeSchema,
  ...DTO_SCHEMAS,
  ...USER_DTO_SCHEMAS,
  ...AUTH_DTO_SCHEMAS,
  ...AVAILABILITY_DTO_SCHEMAS,
  ...FAVORITES_DTO_SCHEMAS,
} as const satisfies Record<string, z.ZodType>;

export type ContractSchemaName = keyof typeof CONTRACT_SCHEMAS;

let registered = false;

/**
 * Zod's global registry turns a schema into a named `$ref`. Registration is global
 * mutable state, so it is done once, on first use, and never from a decorator.
 */
export function registerContractSchemas(): void {
  if (registered) return;
  for (const [name, schema] of Object.entries(CONTRACT_SCHEMAS)) {
    z.globalRegistry.add(schema, { id: name });
  }
  registered = true;
}
