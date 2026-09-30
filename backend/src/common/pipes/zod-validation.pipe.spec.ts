import { z } from 'zod';
import { zodPipe } from './zod-validation.pipe.js';

describe('ZodValidationPipe', () => {
  const pipe = zodPipe(
    z.object({
      page: z.coerce.number().int().min(1).default(1),
      city: z.string().trim().optional(),
    }),
  );

  it('returns the parsed value, not the raw input', () => {
    expect(pipe.transform({ page: '3' })).toEqual({ page: 3 });
  });

  it('throws a VALIDATION_FAILED 400 naming the offending field', () => {
    const error = (() => {
      try {
        pipe.transform({ page: '0' });
      } catch (caught) {
        return caught as { getStatus(): number; getResponse(): unknown };
      }
      return null;
    })();

    expect(error?.getStatus()).toBe(400);
    expect(error?.getResponse()).toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed',
      details: [expect.objectContaining({ path: 'page' })],
    });
  });

  it('does not echo the rejected input back to the caller', () => {
    const schema = z.object({ password: z.string().min(8) });
    const error = (() => {
      try {
        zodPipe(schema).transform({ password: 'hunter2' });
      } catch (caught) {
        return caught as { getResponse(): { details: unknown } };
      }
      return null;
    })();

    expect(JSON.stringify(error?.getResponse().details)).not.toContain(
      'hunter2',
    );
  });
});
