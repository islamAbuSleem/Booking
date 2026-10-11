/**
 * T37 — the cancellation-policy read/write contract, expressed in domain terms.
 *
 * Same shape as the other repositories: the service depends on this interface, never on
 * `PrismaService` (context/code-standards.md, "Dependency inversion").
 */

export const CANCELLATION_REPOSITORY = Symbol('CANCELLATION_REPOSITORY');

export interface PolicyTierRow {
  daysBefore: number;
  refundPercent: number;
}

export interface PolicyRecord {
  hotelId: string;
  tiers: PolicyTierRow[];
  noRefundWithinHours: number;
  version: number;
}

export interface CancellationRepository {
  /** `null` when the hotel has no stored policy (the API default applies). */
  findPolicyByHotel(hotelId: string): Promise<PolicyRecord | null>;
  /** Whether any hotel has this id — so a policy read 404s unknown hotels. */
  hotelExists(hotelId: string): Promise<boolean>;
  /**
   * Store the policy, bumping `version` from the existing row (or starting at 1).
   * Tiers are stored highest-`daysBefore` first.
   */
  upsertPolicy(
    hotelId: string,
    tiers: PolicyTierRow[],
    noRefundWithinHours: number,
  ): Promise<PolicyRecord>;
}
