import { type INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';
import { z } from 'zod';
import { CONTRACT_SCHEMAS, registerContractSchemas } from './schemas.js';

/** Absolute paths. The global `api` prefix is baked in. */
export const OPENAPI_JSON_PATH = '/api/docs-json';
export const OPENAPI_UI_PATH = '/api/docs';

type JsonSchema = Record<string, unknown>;

/**
 * T13a — build the OpenAPI document.
 *
 * The document is assembled in two passes on purpose:
 *
 *   1. `SwaggerModule.createDocument` collects routes and their parameters.
 *   2. Every schema in `CONTRACT_SCHEMAS` is converted from Zod into
 *      `components.schemas`.
 *
 * Response bodies in `openapi.json` are therefore generated from the same Zod schemas
 * the API validates with. There is no second, hand-maintained copy of the shape to
 * drift. Adding a field to a schema and regenerating is the whole workflow.
 *
 * Zod emits JSON Schema using `definitions` and `#/definitions/...` refs; OpenAPI 3.0
 * wants `components/schemas` and `#/components/schemas/...`. The rewrite happens here
 * rather than by hand-editing the committed file.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  registerContractSchemas();

  const config = new DocumentBuilder()
    .setTitle('Booking API')
    .setDescription(
      'Hotel booking platform. Every response uses one envelope: ' +
        '{ success: true, data } or { success: false, error: { code, message, details? } }. ' +
        'Branch on error.code, never on error.message.',
    )
    .setVersion('1.0.0')
    // Paths in this document already include the `api` prefix, so the server is the
    // origin only. Putting `/api` here as well would produce `/api/api/hotels`.
    .addServer(`http://localhost:${process.env['PORT'] ?? 3000}`, 'Local')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  const components = (document.components ??= {});
  const schemas = (components.schemas ??= {});

  for (const [name, schema] of Object.entries(CONTRACT_SCHEMAS)) {
    const { definition, hoisted } = convert(schema, name);
    // Hoist first: `definition` may $ref something Zod only inlined under another name.
    for (const [hoistedName, hoistedSchema] of Object.entries(hoisted)) {
      if (!(hoistedName in schemas)) schemas[hoistedName] = hoistedSchema;
    }
    if (!(name in schemas)) schemas[name] = definition;
  }

  return document;
}

function convert(
  schema: z.ZodType,
  name: string,
): { definition: JsonSchema; hoisted: Record<string, JsonSchema> } {
  const json = z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io: 'output',
    reused: 'ref',
  }) as JsonSchema;

  const definitions = (json['definitions'] ??
    json['$defs'] ??
    {}) as JsonSchema;
  const definition =
    (definitions[name] as JsonSchema | undefined) ?? stripDefs(json);
  return {
    definition: rewriteRefs(definition),
    hoisted: rewriteRefs(definitions) as Record<string, JsonSchema>,
  };
}

function stripDefs(node: JsonSchema): JsonSchema {
  const { definitions, $defs, ...rest } = node;
  void definitions;
  void $defs;
  return rest;
}

/** `#/definitions/X` (Zod) → `#/components/schemas/X` (OpenAPI 3.0). */
function rewriteRefs<T>(node: T): T {
  if (Array.isArray(node)) return node.map((item) => rewriteRefs(item)) as T;
  if (typeof node !== 'object' || node === null) return node;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === '$defs') continue;
    if (
      key === '$ref' &&
      typeof value === 'string' &&
      value.startsWith('#/definitions/')
    ) {
      out[key] = `#/components/schemas/${value.slice('#/definitions/'.length)}`;
      continue;
    }
    out[key] = rewriteRefs(value);
  }
  return out as T;
}
