-- T37: cancellation policies. Additive only: one new table, no existing rows move
-- and no existing table changes. Hotels without a row fall back to the API default.
CREATE TABLE "cancellation_policies" (
  "hotel_id" UUID NOT NULL,
  "tiers" JSONB NOT NULL,
  "no_refund_within_hours" INTEGER NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "cancellation_policies_pkey" PRIMARY KEY ("hotel_id")
);

ALTER TABLE "cancellation_policies" ADD CONSTRAINT "cancellation_policies_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
