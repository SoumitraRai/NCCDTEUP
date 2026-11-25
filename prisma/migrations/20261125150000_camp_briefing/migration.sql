-- AlterTable
ALTER TABLE "Camp" ADD COLUMN     "briefingDate" DATE;

ALTER TABLE "Camp" ADD CONSTRAINT "Camp_briefing_check" CHECK ("briefingDate" IS NULL OR "briefingDate" <= "startDate");
