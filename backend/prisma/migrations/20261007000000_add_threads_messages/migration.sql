-- T35: messaging threads and messages. Additive only: two new tables, no existing
-- rows move and no existing table changes.
CREATE TABLE "threads" (
  "id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "guest_id" UUID NOT NULL,
  "host_id" UUID NOT NULL,
  "guest_unread" INTEGER NOT NULL DEFAULT 0,
  "host_unread" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "threads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "messages" (
  "id" UUID NOT NULL,
  "thread_id" UUID NOT NULL,
  "sender_id" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "read_at" TIMESTAMP(3),

  CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- One thread per (booking, guest, host): the second message reuses the row.
CREATE UNIQUE INDEX "threads_booking_guest_host_key" ON "threads"("booking_id", "guest_id", "host_id");
CREATE INDEX "threads_guest_id_idx" ON "threads"("guest_id");
CREATE INDEX "threads_host_id_idx" ON "threads"("host_id");
CREATE INDEX "messages_thread_id_created_at_idx" ON "messages"("thread_id", "created_at");

ALTER TABLE "threads" ADD CONSTRAINT "threads_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "threads" ADD CONSTRAINT "threads_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "threads" ADD CONSTRAINT "threads_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
