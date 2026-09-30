import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient, type UserRole } from '../src/generated/prisma/client.js';

/**
 * T12 seed. Idempotent and re-runnable: every write is an `upsert` on a natural key, or
 * a `deleteMany` + `createMany` for rows nothing references, so running it twice
 * produces no duplicates and no churn.
 *
 * Hotel names, cities, addresses, room names, room capacities and nightly prices are
 * transcribed from `frontend/app/utils/mock/hotels.ts` so both sides of the contract
 * agree. Two deliberate differences:
 *
 *   * `reviews.rating` is 1-5 here, per context/architecture.md. The mock used 1-10, so
 *     the seeded review ratings are the mock's divided by two and rounded.
 *   * `hotels.description` is unchanged, but the seed cannot manufacture the mock's
 *     1,284 review counts. The review summary the API returns is computed from the rows
 *     that actually exist.
 *
 * Users have no `password_hash`: hashing lands in T14 and this seed must not commit a
 * credential. The three demo accounts are listed in the run output.
 *
 * Run with `npx prisma db seed` (wired in prisma.config.ts). Needs a live database.
 */

const logger = new Logger('seed');

const CURRENCY = 'USD';

type ImageAspect = '3:2' | '4:3' | '16:9' | '1:1';

const ASPECT_SIZES: Record<ImageAspect, [number, number]> = {
  '3:2': [800, 533],
  '4:3': [800, 600],
  '16:9': [1200, 675],
  '1:1': [400, 400],
};

/** Placeholder imagery, same seeds as the mock. Replaced by Cloudinary in T21. */
function imageUrl(seed: string, aspect: ImageAspect): string {
  const [width, height] = ASPECT_SIZES[aspect];
  return `https://picsum.photos/seed/${seed}/${width}/${height}`;
}

interface SeedImage {
  seed: string;
  alt: string;
  aspect: ImageAspect;
  /** Attach to this room as well as the hotel. */
  roomKey?: string;
}

interface SeedRoom {
  /** Stable key, unique within the hotel. Not stored — `name` is the natural key. */
  key: string;
  name: string;
  description: string;
  bedType: string;
  maxGuests: number;
  totalInventory: number;
  priceCents: number;
}

interface SeedHotel {
  slug: string;
  name: string;
  description: string;
  addressLine: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  starRating: number;
  status: 'PENDING' | 'PUBLISHED' | 'REJECTED' | 'SUSPENDED';
  checkInTime: string;
  checkOutTime: string;
  amenityIds: string[];
  images: SeedImage[];
  rooms: SeedRoom[];
}

const AMENITIES = [
  { id: 'wifi', name: 'Wifi', icon: 'wifi' },
  { id: 'pool', name: 'Pool', icon: 'pool' },
  { id: 'parking', name: 'Parking', icon: 'car' },
  { id: 'breakfast', name: 'Breakfast included', icon: 'coffee' },
  { id: 'pets', name: 'Pet friendly', icon: 'paw' },
  { id: 'ac', name: 'Air conditioning', icon: 'snowflake' },
  { id: 'workspace', name: 'Workspace', icon: 'desk' },
  { id: 'gym', name: 'Gym', icon: 'dumbbell' },
  { id: 'spa', name: 'Spa', icon: 'flower' },
  { id: 'restaurant', name: 'Restaurant', icon: 'utensils' },
  { id: 'bar', name: 'Bar', icon: 'glass' },
  { id: 'shuttle', name: 'Airport shuttle', icon: 'plane' },
];

/** One account per role, plus the authors the seeded reviews need. */
const USERS: Array<{
  email: string;
  name: string;
  role: UserRole;
  oauthProvider: string;
  oauthAccountId: string;
}> = [
  {
    email: 'admin@booking.test',
    name: 'Platform Admin',
    role: 'ADMIN',
    oauthProvider: 'github',
    oauthAccountId: 'seed-1001',
  },
  {
    email: 'host@booking.test',
    name: 'Beatriz Salgueiro',
    role: 'HOST',
    oauthProvider: 'github',
    oauthAccountId: 'seed-1002',
  },
  {
    email: 'guest@booking.test',
    name: 'Eleanor Caradus',
    role: 'GUEST',
    oauthProvider: 'google',
    oauthAccountId: 'seed-1003',
  },
  {
    email: 'marc.roussel@booking.test',
    name: 'Marc Roussel',
    role: 'GUEST',
    oauthProvider: 'google',
    oauthAccountId: 'seed-1004',
  },
  {
    email: 'goren.vold@booking.test',
    name: 'Goren Vold',
    role: 'GUEST',
    oauthProvider: 'google',
    oauthAccountId: 'seed-1005',
  },
  {
    email: 'sofia.lindqvist@booking.test',
    name: 'Sofia Lindqvist',
    role: 'GUEST',
    oauthProvider: 'github',
    oauthAccountId: 'seed-1006',
  },
];

const HOTELS: SeedHotel[] = [
  {
    slug: 'the-larkspur-hotel',
    name: 'The Larkspur Hotel',
    description:
      'An 18th-century palazzo on a cobbled lane above the Baixa, with nine rooms, a walled courtyard pool, and a working wine cellar in the basement. The owner restores the building himself and will happily talk you through what he has found under the floorboards.',
    addressLine: 'Rua das Flores 41',
    city: 'Lisbon',
    country: 'Portugal',
    lat: 38.7101,
    lng: -9.1425,
    starRating: 4,
    status: 'PUBLISHED',
    checkInTime: '15:00',
    checkOutTime: '11:00',
    amenityIds: ['wifi', 'pool', 'breakfast', 'ac', 'restaurant', 'bar'],
    images: [
      {
        seed: 'larkspur-main',
        alt: 'The Larkspur courtyard in late afternoon light',
        aspect: '16:9',
      },
      {
        seed: 'larkspur-room',
        alt: 'A king room with tall windows facing the courtyard',
        aspect: '4:3',
        roomKey: 'courtyard-king',
      },
      {
        seed: 'larkspur-bath',
        alt: 'Marble bathroom with a freestanding tub',
        aspect: '4:3',
      },
      {
        seed: 'larkspur-terrace',
        alt: 'The rooftop terrace at dusk',
        aspect: '4:3',
      },
    ],
    rooms: [
      {
        key: 'courtyard-king',
        name: 'Courtyard King Room',
        description:
          'Faces the walled courtyard, with a private terrace and shutters that open onto the fountain.',
        bedType: 'King',
        maxGuests: 2,
        totalInventory: 4,
        priceCents: 21400,
      },
      {
        key: 'terrace-suite',
        name: 'Tagus Terrace Suite',
        description:
          'The top floor, with a private terrace over the river and the whole of Alfama laid out below.',
        bedType: 'King',
        maxGuests: 3,
        totalInventory: 2,
        priceCents: 38000,
      },
      {
        key: 'alley-single',
        name: 'Alley Single',
        description:
          'Small, quiet, and cheap. The one to take if you are in Lisbon to walk.',
        bedType: 'Single',
        maxGuests: 1,
        totalInventory: 3,
        priceCents: 12900,
      },
    ],
  },
  {
    slug: 'casa-verde',
    name: 'Casa Verde',
    description:
      'Eight rooms around a shaded patio two blocks from the market, run by the same family for three generations. Breakfast is mezcal-adjacent and better than it has any right to be.',
    addressLine: 'Calle Curryfane 705',
    city: 'Oaxaca',
    country: 'Mexico',
    lat: 17.0732,
    lng: -96.7266,
    starRating: 3,
    status: 'PUBLISHED',
    checkInTime: '15:00',
    checkOutTime: '12:00',
    amenityIds: ['wifi', 'breakfast', 'ac', 'workspace'],
    images: [
      {
        seed: 'casaverde-main',
        alt: 'Casa Verde patio with a single jacaranda',
        aspect: '16:9',
      },
      {
        seed: 'casaverde-room',
        alt: 'A corner room with limewashed walls',
        aspect: '4:3',
        roomKey: 'standard-double',
      },
      {
        seed: 'casaverde-breakfast',
        alt: 'Breakfast laid out on the patio',
        aspect: '4:3',
      },
    ],
    rooms: [
      {
        key: 'standard-double',
        name: 'Standard Double',
        description: 'Limewashed walls, a shaded window seat, and a fan.',
        bedType: 'Double',
        maxGuests: 2,
        totalInventory: 5,
        priceCents: 18900,
      },
      {
        key: 'patio-room',
        name: 'Patio Room',
        description:
          'Opens straight onto the patio. Loud at breakfast, silent after.',
        bedType: 'Queen',
        maxGuests: 2,
        totalInventory: 3,
        priceCents: 24500,
      },
    ],
  },
  {
    slug: 'hotel-nord',
    name: 'Hotel Nord',
    description:
      'A harbour-facing building from 1911, stripped back to concrete and oak. Twenty-two rooms, a sauna under the stairs, and a very good vinyl record in the lobby.',
    addressLine: 'Dronning Louises Bro 22',
    city: 'Copenhagen',
    country: 'Denmark',
    lat: 55.6761,
    lng: 12.5683,
    starRating: 5,
    status: 'PUBLISHED',
    checkInTime: '14:00',
    checkOutTime: '11:00',
    amenityIds: ['wifi', 'gym', 'spa', 'restaurant', 'bar', 'workspace', 'ac'],
    images: [
      {
        seed: 'nord-main',
        alt: 'Hotel Nord seen across the harbour',
        aspect: '16:9',
      },
      {
        seed: 'nord-room',
        alt: 'A harbour-facing room in pale oak',
        aspect: '4:3',
        roomKey: 'harbour-view',
      },
      {
        seed: 'nord-sauna',
        alt: 'The sauna under the original stair',
        aspect: '4:3',
      },
    ],
    rooms: [
      {
        key: 'harbour-view',
        name: 'Harbour View',
        description:
          'Full-height windows over the water, with blackout blinds that work.',
        bedType: 'Queen',
        maxGuests: 2,
        totalInventory: 8,
        priceCents: 34200,
      },
      {
        key: 'courtyard-king',
        name: 'Courtyard King',
        description: 'Quieter, darker, cheaper. Faces the inner courtyard.',
        bedType: 'King',
        maxGuests: 2,
        totalInventory: 10,
        priceCents: 24800,
      },
    ],
  },
  {
    slug: 'bellavista',
    name: 'Hotel Bellavista',
    description:
      'On the hill above Gràcia, with the best rooftop in the district and a lift that is always out of order.',
    addressLine: 'Carrer de la Reina 88',
    city: 'Barcelona',
    country: 'Spain',
    lat: 41.3874,
    lng: 2.1686,
    starRating: 4,
    status: 'PUBLISHED',
    checkInTime: '14:00',
    checkOutTime: '11:00',
    amenityIds: ['wifi', 'pool', 'parking', 'restaurant', 'bar', 'ac'],
    images: [
      {
        seed: 'bellavista-main',
        alt: 'The Bellavista rooftop at sunset',
        aspect: '16:9',
      },
      {
        seed: 'bellavista-room',
        alt: 'A bright corner room',
        aspect: '4:3',
        roomKey: 'standard-double',
      },
    ],
    rooms: [
      {
        key: 'standard-double',
        name: 'Standard Double',
        description: 'Small, clean, and close to the metro.',
        bedType: 'Double',
        maxGuests: 2,
        totalInventory: 9,
        priceCents: 16400,
      },
    ],
  },
  {
    slug: 'palacio-belmonte',
    name: 'Palácio Belmonte',
    description:
      'A converted sugar-mill estate in Estrela with azulejo floors you are allowed to walk on. Twelve rooms, a saltwater pool, and the best breakfast in the district.',
    addressLine: 'Rua do Açúcar 52',
    city: 'Lisbon',
    country: 'Portugal',
    lat: 38.7139,
    lng: -9.1334,
    starRating: 5,
    status: 'PUBLISHED',
    checkInTime: '15:00',
    checkOutTime: '12:00',
    amenityIds: [
      'wifi',
      'pool',
      'parking',
      'breakfast',
      'spa',
      'restaurant',
      'bar',
      'gym',
    ],
    images: [
      {
        seed: 'palacio-main',
        alt: 'The Palácio courtyard with its stone arches',
        aspect: '16:9',
      },
      {
        seed: 'palacio-room',
        alt: 'A suite with original azulejo floors',
        aspect: '4:3',
        roomKey: 'azulejo-suite',
      },
    ],
    rooms: [
      {
        key: 'azulejo-suite',
        name: 'Azulejo Suite',
        description:
          'Original tiled floors, a separate sitting room, and a balcony over the courtyard.',
        bedType: 'King',
        maxGuests: 2,
        totalInventory: 4,
        priceCents: 61200,
      },
    ],
  },
  {
    slug: 'the-barn-at-fen-end',
    name: 'The Barn at Fen End',
    description:
      'A converted threshing barn on a working farm. Four rooms, an Aga, and more silence than you have had in years.',
    addressLine: 'Fen End Lane, Wymondham',
    city: 'Norfolk',
    country: 'United Kingdom',
    lat: 52.5762,
    lng: 1.1203,
    starRating: 4,
    status: 'PENDING',
    checkInTime: '15:00',
    checkOutTime: '10:00',
    amenityIds: ['wifi', 'breakfast', 'parking', 'pets'],
    images: [
      {
        seed: 'fenend-main',
        alt: 'The barn in flat Norfolk light',
        aspect: '16:9',
      },
    ],
    rooms: [
      {
        key: 'threshing-floor',
        name: 'The Threshing Floor',
        description:
          'Vaulted ceiling, exposed beams, and a bed you have to climb into.',
        bedType: 'King',
        maxGuests: 2,
        totalInventory: 2,
        priceCents: 19800,
      },
    ],
  },
  {
    slug: 'miradouro',
    name: 'Miradouro',
    description:
      'A narrow building above the printing house with six rooms and a view that makes the tram noise feel worthwhile.',
    addressLine: 'Calçada do Combro 12',
    city: 'Lisbon',
    country: 'Portugal',
    lat: 38.7089,
    lng: -9.1487,
    starRating: 3,
    status: 'PUBLISHED',
    checkInTime: '15:00',
    checkOutTime: '11:00',
    amenityIds: ['wifi', 'breakfast', 'ac'],
    images: [
      {
        seed: 'miradouro-main',
        alt: 'Miradouro rooftop terrace over the city',
        aspect: '16:9',
      },
    ],
    rooms: [
      {
        key: 'standard-double',
        name: 'Standard Double',
        description: 'Small, high-ceilinged, and directly above the square.',
        bedType: 'Double',
        maxGuests: 2,
        totalInventory: 4,
        priceCents: 14200,
      },
    ],
  },
  {
    slug: 'casa-lopez',
    name: 'Casa López',
    description:
      'A Roma Norte townhouse with fourteen rooms, a courtyard bar, and a vinyl habit that the owner does not apologise for.',
    addressLine: 'Colima 220, Roma Norte',
    city: 'Mexico City',
    country: 'Mexico',
    lat: 19.4194,
    lng: -99.1626,
    starRating: 4,
    status: 'PUBLISHED',
    checkInTime: '15:00',
    checkOutTime: '12:00',
    amenityIds: ['wifi', 'bar', 'restaurant', 'workspace', 'ac', 'gym'],
    images: [
      {
        seed: 'lopez-main',
        alt: 'Casa López courtyard in the evening',
        aspect: '16:9',
      },
    ],
    rooms: [
      {
        key: 'courtyard-deluxe',
        name: 'Courtyard Deluxe',
        description:
          'High ceilings, original tile, and the courtyard bar directly below.',
        bedType: 'King',
        maxGuests: 2,
        totalInventory: 6,
        priceCents: 27800,
      },
    ],
  },
  {
    slug: 'schloss-hof',
    name: 'Schloss Hof',
    description:
      'An East Side gallery building with nine rooms, an old printing press in the lobby, and a river terrace that gets used hard from May.',
    addressLine: 'Köpenicker Strasse 114',
    city: 'Berlin',
    country: 'Germany',
    lat: 52.5108,
    lng: 13.4276,
    starRating: 4,
    status: 'PUBLISHED',
    checkInTime: '15:00',
    checkOutTime: '11:00',
    amenityIds: ['wifi', 'bar', 'gym', 'breakfast', 'ac'],
    images: [
      {
        seed: 'schloss-main',
        alt: 'Schloss Hof river terrace',
        aspect: '16:9',
      },
    ],
    rooms: [
      {
        key: 'atelier-room',
        name: 'Atelier Room',
        description:
          'A former print studio. White walls, industrial glazing, very good light.',
        bedType: 'Queen',
        maxGuests: 2,
        totalInventory: 5,
        priceCents: 22600,
      },
    ],
  },
  {
    slug: 'casa-do-douro',
    name: 'Casa do Douro',
    description:
      'Five rooms above a port-wine lodge, with the cellar tour included and the loudest street in Porto outside the door.',
    addressLine: 'Rua das Flores 88',
    city: 'Porto',
    country: 'Portugal',
    lat: 41.1459,
    lng: -8.6118,
    starRating: 3,
    status: 'PUBLISHED',
    checkInTime: '15:00',
    checkOutTime: '11:00',
    amenityIds: ['wifi', 'breakfast', 'restaurant'],
    images: [
      {
        seed: 'douro-main',
        alt: 'Casa do Douro facade above the Ribeira',
        aspect: '16:9',
      },
    ],
    rooms: [
      {
        key: 'tawny-room',
        name: 'Tawny Room',
        description:
          'Named for the port. Windows onto a courtyard and a very old wall.',
        bedType: 'Double',
        maxGuests: 2,
        totalInventory: 3,
        priceCents: 15600,
      },
    ],
  },
  {
    slug: 'pousada-da-serra',
    name: 'Pousada da Serra',
    description:
      'Eight rooms in a 1902 villa on the edge of the city, with two hectares of walled garden that the dogs have the run of.',
    addressLine: 'Rua da Serra 141',
    city: 'Porto',
    country: 'Portugal',
    lat: 41.1581,
    lng: -8.6203,
    starRating: 5,
    status: 'PUBLISHED',
    checkInTime: '16:00',
    checkOutTime: '11:00',
    amenityIds: [
      'wifi',
      'pool',
      'parking',
      'spa',
      'restaurant',
      'pets',
      'breakfast',
    ],
    images: [
      {
        seed: 'pousada-main',
        alt: 'The walled garden at Pousada da Serra',
        aspect: '16:9',
      },
    ],
    rooms: [
      {
        key: 'garden-room',
        name: 'Garden Room',
        description: 'Opens onto the walled garden. Old tiles, new plumbing.',
        bedType: 'King',
        maxGuests: 2,
        totalInventory: 4,
        priceCents: 41800,
      },
    ],
  },
  {
    slug: 'casa-del-mar',
    name: 'Casa del Mar',
    description:
      'Six rooms on the waterfront strip. Submitted with a stock photograph and a description copied from a competitor.',
    addressLine: 'Carrer de la Barceloneta 3',
    city: 'Barcelona',
    country: 'Spain',
    lat: 41.3784,
    lng: 2.1925,
    starRating: 3,
    status: 'REJECTED',
    checkInTime: '14:00',
    checkOutTime: '11:00',
    amenityIds: ['wifi', 'ac'],
    images: [
      {
        seed: 'casadelmar-main',
        alt: 'Waterfront facade on the Barceloneta',
        aspect: '16:9',
      },
    ],
    rooms: [
      {
        key: 'standard-double',
        name: 'Standard Double',
        description: 'Small sea-facing room.',
        bedType: 'Double',
        maxGuests: 2,
        totalInventory: 6,
        priceCents: 14800,
      },
    ],
  },
];

interface SeedBooking {
  reference: string;
  guestEmail: string;
  hotelSlug: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  guestsCount: number;
  status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  review?: {
    title: string;
    body: string;
    /** Already on the 1-5 scale the schema stores. */
    rating: number;
    createdAt: string;
  };
}

/** Fees are zero here: the fee model is T18's job, and inventing one in a seed would
 *  quietly become the contract. */
const BOOKINGS: SeedBooking[] = [
  {
    reference: 'GB-1001',
    guestEmail: 'guest@booking.test',
    hotelSlug: 'the-larkspur-hotel',
    roomName: 'Courtyard King Room',
    checkIn: '2024-05-12',
    checkOut: '2024-05-15',
    guestsCount: 2,
    status: 'COMPLETED',
    review: {
      title: 'An architectural jewel, and the staff are unusually kind',
      body: 'The renovation is exemplary. There is one of the original 18th-century tiles on every stair, which the owner restores in the winter. The breakfast exceeded every modest expectation I arrived with.',
      rating: 5,
      createdAt: '2024-05-12',
    },
  },
  {
    reference: 'GB-1002',
    guestEmail: 'marc.roussel@booking.test',
    hotelSlug: 'the-larkspur-hotel',
    roomName: 'Tagus Terrace Suite',
    checkIn: '2024-04-28',
    checkOut: '2024-05-04',
    guestsCount: 3,
    status: 'COMPLETED',
    review: {
      title: 'The Tagus Terrace suite at sunset is unforgettable',
      body: 'We booked the suite for four nights and extended by two. The view over Alfama is the one every other hotel in the city is trying to sell you on, and here it is from bed.',
      rating: 4,
      createdAt: '2024-04-28',
    },
  },
  {
    reference: 'GB-1003',
    guestEmail: 'goren.vold@booking.test',
    hotelSlug: 'casa-verde',
    roomName: 'Patio Room',
    checkIn: '2024-03-15',
    checkOut: '2024-03-19',
    guestsCount: 2,
    status: 'COMPLETED',
    review: {
      title: 'Perfect spatial cadence and respectful preservation',
      body: 'Not renovated, not restored — simply respected. The acidity of the rooms is remarkable, and the family have been running it for three generations.',
      rating: 5,
      createdAt: '2024-03-15',
    },
  },
  {
    reference: 'GB-1004',
    guestEmail: 'sofia.lindqvist@booking.test',
    hotelSlug: 'hotel-nord',
    roomName: 'Harbour View',
    checkIn: '2024-05-02',
    checkOut: '2024-05-05',
    guestsCount: 2,
    status: 'COMPLETED',
    review: {
      title: 'Considered civic and exceptionally quiet',
      body: 'The room rates on the harbour wing are exceptionally well judged for the calm. There is a single lift for twenty-two rooms and it is frequently broken.',
      rating: 5,
      createdAt: '2024-05-02',
    },
  },
];

interface SeedBlackout {
  hotelSlug: string;
  /** Seed key of the room, or null for a whole-hotel closure. */
  roomKey: string | null;
  startsOn: string;
  endsOn: string;
  reason: string;
}

const BLACKOUTS: SeedBlackout[] = [
  {
    hotelSlug: 'the-barn-at-fen-end',
    roomKey: 'threshing-floor',
    startsOn: '2026-12-24',
    endsOn: '2026-12-26',
    reason: 'Closed for repairs',
  },
  {
    hotelSlug: 'the-larkspur-hotel',
    roomKey: null,
    startsOn: '2026-12-25',
    endsOn: '2026-12-25',
    reason: 'Annual closure',
  },
];

/** Postgres `DATE` from a `YYYY-MM-DD` string, without a timezone round trip. */
function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = dateOnly(checkOut).getTime() - dateOnly(checkIn).getTime();
  return Math.round(ms / 86_400_000);
}

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is required to seed. It must be the POOLED Neon URL.',
    );
  }

  const adapter = new PrismaNeon({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    for (const currency of [
      { code: CURRENCY, name: 'US Dollar', symbol: '$', isActive: true },
    ]) {
      await prisma.currency.upsert({
        where: { code: currency.code },
        create: currency,
        update: {
          name: currency.name,
          symbol: currency.symbol,
          isActive: currency.isActive,
        },
      });
    }
    logger.log(`[seed] currencies: ${CURRENCY} active`);

    const userIds = new Map<string, string>();
    for (const user of USERS) {
      const row = await prisma.user.upsert({
        where: { email: user.email },
        // Every seeded row carries an OAuth identity: a user with neither a password nor
        // an OAuth link could never sign in, and the seed should not model that.
        create: { ...user, passwordHash: null },
        update: {
          name: user.name,
          role: user.role,
          oauthProvider: user.oauthProvider,
          oauthAccountId: user.oauthAccountId,
        },
        select: { id: true },
      });
      userIds.set(user.email, row.id);
    }
    logger.log(`[seed] users: ${USERS.length}`);

    for (const amenity of AMENITIES) {
      await prisma.amenity.upsert({
        where: { id: amenity.id },
        create: amenity,
        update: { name: amenity.name, icon: amenity.icon },
      });
    }
    logger.log(`[seed] amenities: ${AMENITIES.length}`);

    const hostId = userIds.get('host@booking.test');
    if (!hostId) throw new Error('seed host user missing');

    const hotelIds = new Map<string, string>();
    const roomIds = new Map<string, string>();

    for (const hotel of HOTELS) {
      const hotelColumns = {
        name: hotel.name,
        slug: hotel.slug,
        description: hotel.description,
        addressLine: hotel.addressLine,
        city: hotel.city,
        country: hotel.country,
        lat: hotel.lat,
        lng: hotel.lng,
        starRating: hotel.starRating,
        status: hotel.status,
        checkInTime: hotel.checkInTime,
        checkOutTime: hotel.checkOutTime,
      };
      // `upsert` returns the row, so the id comes back from the same round trip rather
      // than from a follow-up read.
      const { id: hotelId } = await prisma.hotel.upsert({
        where: { slug: hotel.slug },
        create: { ...hotelColumns, hostId },
        update: { ...hotelColumns, hostId },
        select: { id: true },
      });
      hotelIds.set(hotel.slug, hotelId);

      for (const amenityId of hotel.amenityIds) {
        await prisma.hotelAmenity.upsert({
          where: { hotelId_amenityId: { hotelId, amenityId } },
          create: { hotelId, amenityId },
          update: {},
        });
      }

      for (const [index, room] of hotel.rooms.entries()) {
        const { key, priceCents, ...roomData } = room;
        const { id: roomId } = await prisma.room.upsert({
          where: { hotelId_name: { hotelId, name: room.name } },
          create: { ...roomData, hotelId, sortOrder: index },
          update: { ...roomData, sortOrder: index },
          select: { id: true },
        });
        roomIds.set(`${hotel.slug}/${key}`, roomId);

        // One USD row per room. T39 adds currencies by INSERTING here, never by
        // altering a populated table.
        await prisma.roomPrice.upsert({
          where: { roomId_currency: { roomId, currency: CURRENCY } },
          create: { roomId, currency: CURRENCY, priceCents },
          update: { priceCents },
        });
      }

      for (const [index, image] of hotel.images.entries()) {
        const [width, height] = ASPECT_SIZES[image.aspect];
        const roomId = image.roomKey
          ? roomIds.get(`${hotel.slug}/${image.roomKey}`)
          : undefined;
        const data = {
          hotelId,
          roomId: roomId ?? null,
          url: imageUrl(image.seed, image.aspect),
          publicId: `booking/hotels/${image.seed}`,
          altText: image.alt,
          aspect: image.aspect,
          width,
          height,
          sortOrder: index,
          isCover: index === 0,
        };
        await prisma.hotelImage.upsert({
          where: { hotelId_url: { hotelId, url: data.url } },
          create: data,
          update: data,
        });
      }
    }
    logger.log(
      `[seed] hotels: ${HOTELS.length} (rooms, prices, amenities, images)`,
    );

    for (const blackout of BLACKOUTS) {
      const hotelId = hotelIds.get(blackout.hotelSlug);
      if (!hotelId)
        throw new Error(
          `blackout references unknown hotel ${blackout.hotelSlug}`,
        );
      // Nothing references a blackout, so replace the set outright. This is the one
      // place the seed deletes, and it is safe to re-run.
      await prisma.blackoutDate.deleteMany({
        where: { hotelId, reason: blackout.reason },
      });
      await prisma.blackoutDate.create({
        data: {
          hotelId,
          roomId: blackout.roomKey
            ? (roomIds.get(`${blackout.hotelSlug}/${blackout.roomKey}`) ?? null)
            : null,
          startsOn: dateOnly(blackout.startsOn),
          endsOn: dateOnly(blackout.endsOn),
          reason: blackout.reason,
        },
      });
    }
    logger.log(`[seed] blackout dates: ${BLACKOUTS.length}`);

    for (const booking of BOOKINGS) {
      const guestId = userIds.get(booking.guestEmail);
      const hotelId = hotelIds.get(booking.hotelSlug);
      const roomId = roomIds.get(
        `${booking.hotelSlug}/${roomKeyFor(booking.hotelSlug, booking.roomName)}`,
      );
      if (!guestId || !hotelId || !roomId) {
        throw new Error(
          `booking ${booking.reference} references an unknown row`,
        );
      }

      const price = await prisma.roomPrice.findUniqueOrThrow({
        where: { roomId_currency: { roomId, currency: CURRENCY } },
      });
      const nights = nightsBetween(booking.checkIn, booking.checkOut);
      const subtotalCents = nights * price.priceCents;

      const row = await prisma.booking.upsert({
        where: { reference: booking.reference },
        create: {
          reference: booking.reference,
          guestId,
          roomId,
          checkIn: dateOnly(booking.checkIn),
          checkOut: dateOnly(booking.checkOut),
          guestsCount: booking.guestsCount,
          nights,
          subtotalCents,
          feesCents: 0,
          totalCents: subtotalCents,
          currency: CURRENCY,
          status: booking.status,
        },
        update: {
          guestId,
          roomId,
          checkIn: dateOnly(booking.checkIn),
          checkOut: dateOnly(booking.checkOut),
          guestsCount: booking.guestsCount,
          nights,
          subtotalCents,
          totalCents: subtotalCents,
          currency: CURRENCY,
          status: booking.status,
        },
        select: { id: true },
      });

      await prisma.payment.upsert({
        where: { bookingId: row.id },
        create: {
          bookingId: row.id,
          stripePaymentIntentId: `pi_seed_${booking.reference.replace('-', '')}`,
          amountCents: subtotalCents,
          currency: CURRENCY,
          status: 'succeeded',
        },
        update: {
          amountCents: subtotalCents,
          currency: CURRENCY,
          status: 'succeeded',
        },
      });

      if (booking.review) {
        await prisma.review.upsert({
          where: { bookingId: row.id },
          create: {
            bookingId: row.id,
            authorId: guestId,
            hotelId,
            rating: booking.review.rating,
            title: booking.review.title,
            body: booking.review.body,
            status: 'VISIBLE',
            createdAt: dateOnly(booking.review.createdAt),
          },
          update: {
            rating: booking.review.rating,
            title: booking.review.title,
            body: booking.review.body,
            status: 'VISIBLE',
          },
        });
      }
    }
    logger.log(
      `[seed] bookings: ${BOOKINGS.length} (with payments and reviews)`,
    );
    logger.log(
      '[seed] demo accounts: admin@booking.test, host@booking.test, guest@booking.test',
    );
  } finally {
    await prisma.$disconnect();
  }
}

/** Rooms are keyed by a stable slug in the seed data; bookings reference them by name. */
function roomKeyFor(hotelSlug: string, roomName: string): string {
  const hotel = HOTELS.find((candidate) => candidate.slug === hotelSlug);
  const room = hotel?.rooms.find((candidate) => candidate.name === roomName);
  if (!room) throw new Error(`no seeded room "${roomName}" in ${hotelSlug}`);
  return room.key;
}

await main().catch((error: unknown) => {
  logger.error(
    '[seed] failed',
    error instanceof Error ? error.stack : String(error),
  );
  process.exitCode = 1;
});
