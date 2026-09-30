import { HttpStatus, Injectable, type PipeTransform } from '@nestjs/common';
import { z, type ZodType } from 'zod';
import { ApiError } from '../errors/api-error.js';

/**
 * T13 — Zod at the boundary.
 *
 * Zod 4 notes that matter here:
 *   * `z.iso.date()` validates a `YYYY-MM-DD` string. `z.string().date()` is GONE.
 *   * `z.email()` replaces `z.string().email()`.
 *   * query params arrive as strings, so numeric fields need `z.coerce`.
 *
 * A failure is a `VALIDATION_FAILED` 400 with the field paths in `details`. The client
 * sees which field was wrong and never the schema that rejected it.
 */
@Injectable()
export class ZodValidationPipe<T extends ZodType> implements PipeTransform<
  unknown,
  z.infer<T>
> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      'VALIDATION_FAILED',
      'Request validation failed',
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
}

/** Usage: `@Query(new ZodValidationPipe(hotelSearchQuery))`. */
export function zodPipe<T extends ZodType>(schema: T): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}
