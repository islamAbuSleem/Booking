import { HealthService } from './health.service.js';

function prismaThat(behaviour: 'up' | 'down'): {
  $queryRaw: () => Promise<unknown>;
} {
  return {
    $queryRaw: () =>
      behaviour === 'up'
        ? Promise.resolve([{ '?column?': 1 }])
        : Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:5432')),
  };
}

describe('HealthService', () => {
  it('reports ok when the database answers', async () => {
    const service = new HealthService(prismaThat('up') as never);

    await expect(service.check()).resolves.toEqual({ status: 'ok', db: 'up' });
  });

  it('reports degraded without throwing when the database is unreachable', async () => {
    const service = new HealthService(prismaThat('down') as never);

    await expect(service.check()).resolves.toEqual({
      status: 'degraded',
      db: 'down',
    });
  });
});
