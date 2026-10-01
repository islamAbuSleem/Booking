import {
  buildOverlappingBlackoutsWhere,
  buildOverlappingBookingsWhere,
} from './prisma-availability.repository.js';

const ROOM_ID = '22222222-2222-4222-8222-222222222222';
const HOTEL_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-05-20T10:00:00.000Z');

/**
 * These are the two filters that decide whether a night counts as taken, so they are pinned
 * here with no database. A post-filter in the service would be wrong: a room is only
 * sellable if the rows the query excluded could not have been holding it.
 */
interface HoldingBranch {
  status: string;
  holdExpiresAt?: { gt: Date };
}

describe('buildOverlappingBookingsWhere', () => {
  const where = () =>
    buildOverlappingBookingsWhere([ROOM_ID], '2026-06-01', '2026-06-04', NOW);

  const branches = () => where().OR as HoldingBranch[];

  it('counts CONFIRMED as a stay, which holds the room for its whole range', () => {
    expect(branches()).toContainEqual({ status: 'CONFIRMED' });
  });

  it('counts PENDING only while its hold has not expired, because a hold lapses', () => {
    const pending = branches().find((branch) => branch.status === 'PENDING');

    expect(pending?.holdExpiresAt).toEqual({ gt: NOW });
  });

  it('excludes COMPLETED and CANCELLED, which hold nothing', () => {
    const statuses = branches().map((branch) => branch.status);

    expect(statuses).not.toContain('COMPLETED');
    expect(statuses).not.toContain('CANCELLED');
  });

  it('does not count an expired PENDING row, so an abandoned checkout cannot close a room', () => {
    // The predicate is a strict `gt`, so a hold that lapsed before `now` is not returned and
    // the unit it was sitting on is sellable again.
    const branch = branches().find((one) => one.status === 'PENDING');
    const boundary = branch?.holdExpiresAt?.gt as Date;

    expect(boundary.toISOString()).toBe(NOW.toISOString());
    expect(boundary > new Date(NOW.getTime() - 1)).toBe(true);
  });

  it('scopes the query to the requested rooms', () => {
    expect(where().roomId).toEqual({ in: [ROOM_ID] });
  });

  it('overlaps with strict bounds, so back-to-back stays never double-count', () => {
    // A stay that leaves on the 4th does not touch a night of a stay starting on the 4th,
    // and a stay arriving on the 1st does not touch a night of one ending on the 1st.
    expect(where().checkIn).toEqual({
      lt: new Date('2026-06-04T00:00:00.000Z'),
    });
    expect(where().checkOut).toEqual({
      gt: new Date('2026-06-01T00:00:00.000Z'),
    });
  });

  it('builds the day bounds in UTC, so a local timezone cannot shift a night', () => {
    const built = where();

    expect((built.checkIn as { lt: Date }).lt.toISOString()).toBe(
      '2026-06-04T00:00:00.000Z',
    );
    expect((built.checkOut as { gt: Date }).gt.toISOString()).toBe(
      '2026-06-01T00:00:00.000Z',
    );
  });
});

describe('buildOverlappingBlackoutsWhere', () => {
  const where = () =>
    buildOverlappingBlackoutsWhere(HOTEL_ID, '2026-06-01', '2026-06-04');

  it('scopes the query to the hotel, so another hotel cannot close this one', () => {
    expect(where().hotelId).toBe(HOTEL_ID);
  });

  it('excludes a blackout that starts on the checkout day, which is not a night', () => {
    // A hotel that reopens on the day a guest leaves is not closed for any night of that
    // stay, and checkOut is not one of its nights.
    expect(where().startsOn).toEqual({
      lt: new Date('2026-06-04T00:00:00.000Z'),
    });
  });

  it('includes a blackout that ends on the first night, because endsOn is inclusive', () => {
    expect(where().endsOn).toEqual({
      gte: new Date('2026-06-01T00:00:00.000Z'),
    });
  });

  it('builds the day bounds in UTC, so a local timezone cannot shift a night', () => {
    const built = where();

    expect((built.startsOn as { lt: Date }).lt.toISOString()).toBe(
      '2026-06-04T00:00:00.000Z',
    );
    expect((built.endsOn as { gte: Date }).gte.toISOString()).toBe(
      '2026-06-01T00:00:00.000Z',
    );
  });
});
