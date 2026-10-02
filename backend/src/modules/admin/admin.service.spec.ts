import { describe, expect, it, vi } from 'vitest';
import { AdminService } from './admin.service.js';
import type {
  AdminRepository,
  AdminUserItem,
} from '../../prisma/admin.repository.js';

/**
 * T25 — the moderation rules with no database. The wire codes are pinned over HTTP in
 * `test/admin.e2e-spec.ts`; this file pins the two decisions that live in the service
 * rather than the repository: self-suspension is refused before delegating, and every
 * action is audit-logged with the acting admin's id.
 */

const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function user(): AdminUserItem {
  return {
    id: USER_ID,
    email: 'bo@example.com',
    name: 'Bo',
    role: 'HOST',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };
}

function setup() {
  const repo: AdminRepository = {
    stats: () => Promise.resolve({
      usersTotal: 0,
      usersByRole: { GUEST: 0, HOST: 0, ADMIN: 0 },
      hotelsTotal: 0,
      hotelsByStatus: { PENDING: 0, PUBLISHED: 0, REJECTED: 0, SUSPENDED: 0 },
      bookingsTotal: 0,
      bookingsByStatus: { PENDING: 0, CONFIRMED: 0, COMPLETED: 0, CANCELLED: 0 },
      reviewsTotal: 0,
      reviewsHidden: 0,
    }),
    listHotels: () => Promise.resolve([]),
    updateHotelStatus: () => { throw new Error('unused'); },
    listUsers: () => Promise.resolve([]),
    updateUserStatus: (_id: string, status: 'ACTIVE' | 'SUSPENDED') =>
      Promise.resolve({ ...user(), status }),
    listReviews: () => Promise.resolve([]),
    updateReviewStatus: () => { throw new Error('unused'); },
  };
  const service = new AdminService(repo);
  const logs: string[] = [];
  vi.spyOn(service['logger'], 'log').mockImplementation((message: string) => {
    logs.push(message);
  });
  return { service, repo, logs };
}

describe('AdminService', () => {
  it('suspends another user and audit-logs the actor', async () => {
    const { service, logs } = setup();

    const updated = await service.setUserStatus(ADMIN_ID, USER_ID, 'SUSPENDED');

    expect(updated.status).toBe('SUSPENDED');
    expect(logs).toEqual([`[admin] ${ADMIN_ID} set user ${USER_ID} to SUSPENDED`]);
  });

  it('reactivates a user', async () => {
    const { service } = setup();

    const updated = await service.setUserStatus(ADMIN_ID, USER_ID, 'ACTIVE');

    expect(updated.status).toBe('ACTIVE');
  });

  it('refuses self-suspension before touching the repository', async () => {
    const { service, repo, logs } = setup();
    const update = vi.spyOn(repo, 'updateUserStatus');

    await expect(service.setUserStatus(ADMIN_ID, ADMIN_ID, 'SUSPENDED')).rejects.toMatchObject({
      response: { code: 'ADMIN_SELF_SUSPEND' },
    });
    expect(update).not.toHaveBeenCalled();
    expect(logs).toHaveLength(0);
  });

  it('audit-logs reads too, not just writes', async () => {
    const { service, logs } = setup();

    await service.stats(ADMIN_ID);

    expect(logs).toEqual([`[admin] ${ADMIN_ID} read stats`]);
  });
});
