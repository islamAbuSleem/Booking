import { HOLDING_BOOKING_STATUSES } from './availability.repository.js';
import {
  buildOverlappingBlackoutsWhere,
  buildOverlappingBookingsWhere,
} from './prisma-availability.repository.js';

const ROOM_ID = '22222222-2222-4222-8222-222222222222';
const HOTEL_ID = '11111111-1111-4111-8111-111111111111';

/**
 * These are the two filters that decide whether a night counts as taken, so they are pinned
 * here with no database. A post-filter in the service would be wrong: a room is only
 * sellable if the rows the query excluded could not have been holding it.
 */
describe('buildOverlappingBookingsWhere', () => {
  const where = () =>
    buildOverlappingBookingsWhere([ROOM_ID], '2026-06-01', '2026-06-04');

  it('counts PENDING as well as CONFIRMED, because a PENDING row is a T20 hold', () => {
    expect(where().status).toEqual({ in: ['PENDING', 'CONFIRMED'] });
  });

  it('excludes COMPLETED and CANCELLED, which hold nothing', () => {
    const statuses = (where().status as { in: string[] }).in;

    expect(statuses).not.toContain('COMPLETED');
    expect(statuses).not.toContain('CANCELLED');
  });

  it('derives the status list from the one constant, so the rule has a single definition', () => {
    expect(where().status).toEqual({ in: [...HOLDING_BOOKING_STATUSES] });
  });

  it('scopes the query to the requested rooms', () => {
    expect(where().roomId).toEqual({ in: [ROOM_ID] });
  });

  it('overlaps with strict bounds, so back-to-back stays never double-count', () => {
    // A stay that leaves on the 4th does not touch a night of a stay starting on the 4th,
    // and a stay arriving on the 1st does not touch a night of one ending on the 1st.
    expect(where().checkIn).toEqual({ lt: new Date('2026-06-04T00:00:00.000Z') });
    expect(where().checkOut).toEqual({ gt: new Date('2026-06-01T00:00:00.000Z') });
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
    expect(where().startsOn).toEqual({ lt: new Date('2026-06-04T00:00:00.000Z') });
  });

  it('includes a blackout that ends on the first night, because endsOn is inclusive', () => {
    expect(where().endsOn).toEqual({ gte: new Date('2026-06-01T00:00:00.000Z') });
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
