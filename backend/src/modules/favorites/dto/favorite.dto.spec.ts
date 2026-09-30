import { createFavoriteSchema, favoriteHotelIdParam } from './favorite.dto.js';

const HOTEL_ID = '11111111-1111-4111-8111-111111111111';

describe('createFavoriteSchema', () => {
  it('accepts the ticket body: a hotel uuid and nothing else', () => {
    expect(createFavoriteSchema.parse({ hotelId: HOTEL_ID })).toEqual({
      hotelId: HOTEL_ID,
    });
  });

  it('strips a userId from the body instead of taking it', () => {
    // The guest is the JWT subject. Stripping (rather than rejecting) is what every schema
    // in this API does, and the important part is the same either way: the parsed body has
    // no `userId` for the controller to pass on.
    const parsed = createFavoriteSchema.parse({
      hotelId: HOTEL_ID,
      userId: '55555555-5555-4555-8555-555555555555',
    });

    expect(parsed).not.toHaveProperty('userId');
  });

  it('rejects a missing hotelId', () => {
    expect(createFavoriteSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a hotelId that is not a uuid, so it cannot be interpolated into a query', () => {
    expect(
      createFavoriteSchema.safeParse({ hotelId: '1 OR 1=1' }).success,
    ).toBe(false);
  });
});

describe('favoriteHotelIdParam', () => {
  it('accepts a hotel uuid from the path', () => {
    expect(favoriteHotelIdParam.parse({ hotelId: HOTEL_ID }).hotelId).toBe(
      HOTEL_ID,
    );
  });

  it('rejects a hotel slug, because the row is keyed by the hotel id', () => {
    expect(
      favoriteHotelIdParam.safeParse({ hotelId: 'the-larkspur-hotel' }).success,
    ).toBe(false);
  });

  it('rejects a missing path parameter', () => {
    expect(favoriteHotelIdParam.safeParse({}).success).toBe(false);
  });
});
