-- T38: the refund ledger. Additive only: one new table, one new enum, no existing rows
-- move and no existing table changes. One row per attempt; the invariant is at most one
-- `succeeded` row per booking, not at most one attempt (D11).
CREATE TYPE "RefundStatus" AS ENUM ('pending', 'succeeded', 'failed');

CREATE TABLE "refunds" (
  "id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "payment_id" UUID NOT NULL,
  "stripe_refund_id" TEXT,
  "amount_cents" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "percent" INTEGER NOT NULL,
  "reason" TEXT,
  "status" "RefundStatus" NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- Unique, and Postgres allows repeated NULLs, so every pending attempt can coexist and
-- a settled Stripe id can only ever appear once.
CREATE UNIQUE INDEX "refunds_stripe_refund_id_key" ON "refunds"("stripe_refund_id");
CREATE INDEX "refunds_booking_id_idx" ON "refunds"("booking_id");

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
