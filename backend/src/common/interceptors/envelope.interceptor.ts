import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';
import { SKIP_ENVELOPE } from '../envelope.js';

/**
 * Wraps every successful response in `{ success: true, data }`.
 *
 * Errors are not handled here — the exception filter owns the `{ success: false, error }`
 * side, so a thrown `HttpException` never passes through this `map`.
 */
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ENVELOPE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    return next
      .handle()
      .pipe(map((data: unknown) => ({ success: true, data })));
  }
}
