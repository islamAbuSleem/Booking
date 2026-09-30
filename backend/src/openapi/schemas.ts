import { z } from 'zod';
import { errorEnvelopeSchema } from '../common/envelope.js';
import { DTO_SCHEMAS } from '../modules/hotels/dto/hotel.dto.js';

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
