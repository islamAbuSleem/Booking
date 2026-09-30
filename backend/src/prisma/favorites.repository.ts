/**
 * T19 — the favourites write contract, expressed in domain terms.
 *
 * The favourites service depends on this interface, not on `PrismaService`
 * (context/code-standards.md, "Dependency inversion"), so the toggle rules are testable with
 * an in-memory fake and no database. `PrismaFavoritesRepository` is the one implementation,
 * and it is the only place a Prisma type appears.
 *
 * `userId` is a parameter of every method rather than something the repository reads off a
 * session: the value is resolved from the JWT at the edge, so a caller can only ever ask for
 * its own rows.
 */

export const FAVORITES_REPOSITORY = Symbol('FAVORITES_REPOSITORY');

export interface FavoriteRecord {
  userId: string;
  hotelId: string;
  createdAt: Date;
}

export interface FavoritesRepository {
  /** Whether a hotel with that id exists at all. The foreign key is the real guarantee. */
  hotelExists(hotelId: string): Promise<boolean>;
  /**
   * `null` when the `(userId, hotelId)` pair is already there. The composite primary key is
   * the authority on "already a favourite": a read-then-write would be a race, and this is
   * the one case the toggle has to report rather than paper over.
   */
  create(userId: string, hotelId: string): Promise<FavoriteRecord | null>;
  /**
   * Never fails for a row that is not there. Un-favouriting something that was never
   * favourited is a state the guest reaches on purpose, and it is not an error (T19).
   */
  remove(userId: string, hotelId: string): Promise<void>;
}
