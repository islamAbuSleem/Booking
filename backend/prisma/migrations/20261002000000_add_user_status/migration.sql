-- T25: account suspension state. Additive only: the enum and the column arrive with a
-- default, so every existing row becomes ACTIVE and no data moves.
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
ALTER TABLE "users" ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';
