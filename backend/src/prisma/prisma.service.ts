import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * The one Prisma client for the whole process.
 *
 * A driver adapter is mandatory in Prisma 7, and the Neon adapter takes a **config
 * object** — not a `pg.Pool`. `DATABASE_URL` is the POOLED Neon connection string with
 * `connect_timeout=10`; `pool_timeout` is a `pg` option the adapter ignores, so it is
 * deliberately absent.
 *
 * Instantiating a client per request leaks connections, so this is a singleton and this
 * is the only class allowed to construct one.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Inject(ConfigService) config: ConfigService) {
    // `super()` must be the first statement, so the adapter is built inline.
    // The token is explicit (`@Inject`) rather than inferred, because the
    // OpenAPI preview runs under tsx/esbuild, which never emits
    // `design:paramtypes` — inferred injection silently resolves to undefined
    // there. Explicit tokens work on every transform (tsc, tsx, vitest).
    super({
      adapter: new PrismaNeon({
        connectionString: config.getOrThrow<string>('DATABASE_URL'),
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('[prisma] connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
