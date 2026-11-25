-- Authorised cadet strength per type (CadetStrength) replaces the single
-- vacancy figure (user decision, 2026-11-25); existing values were synthetic.

-- AlterTable
ALTER TABLE "Institution" DROP COLUMN "vacancy";

