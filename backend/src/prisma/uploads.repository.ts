/**
 * T21 — the hotel-image write contract, expressed in domain terms.
 *
 * Same shape as the other repositories: the uploads service depends on this interface,
 * never on `PrismaService` (context/code-standards.md, "Dependency inversion"), so the
 * attach/delete rules are testable with an in-memory fake and no database.
 * `PrismaUploadsRepository` is the one implementation, and it is the only place a
 * Prisma type appears.
 *
 * `hotelId` is a parameter of every write rather than something the repository reads off
 * a session: the value comes from the request, and the caller's authority to touch it is
 * enforced by the host listing-management ticket (T22). T21 enforces only the
 * Cloudinary folder-prefix rule (D58), which is a plain string check the service does
 * before it ever calls here.
 */

export const UPLOADS_REPOSITORY = Symbol('UPLOADS_REPOSITORY');

/**
 * A persisted `hotel_images` row, reduced to what the `attach` response and the delete
 * path need. `aspect`/`width`/`height` are the intrinsic dimensions the T16 detail read
 * hands the client so the browser can reserve the box before the bytes land.
 */
export interface HotelImageRecord {
  id: string;
  hotelId: string;
  roomId: string | null;
  url: string;
  publicId: string | null;
  altText: string | null;
  aspect: string;
  width: number;
  height: number;
  isCover: boolean;
}

/** Everything `create` writes. Omitted dimensions fall back to the schema defaults. */
export interface HotelImageCreateInput {
  hotelId: string;
  roomId: string | null;
  url: string;
  publicId: string | null;
  altText: string | null;
  aspect: string;
  width: number;
  height: number;
  isCover: boolean;
}

export interface UploadsRepository {
  /**
   * Persists the `hotel_images` row. The `(hotelId, url)` pair is unique in the schema:
   * the same asset is never attached to a hotel twice, so a repeat attach is a conflict,
   * not a second row. Returns the row with its effective (possibly default) dimensions.
   */
  create(input: HotelImageCreateInput): Promise<HotelImageRecord>;

  /**
   * `null` when no row holds that `publicId`. The delete path uses it to 404 before it
   * destroys a Cloudinary asset the database knows nothing about.
   */
  findByPublicId(publicId: string): Promise<HotelImageRecord | null>;

  /**
   * Removes the row(s) with that `publicId`. The caller has already 404'd a missing id
   * via `findByPublicId`, so a zero here is only a race, not an error to surface.
   */
  deleteByPublicId(publicId: string): Promise<void>;
}
