-- AlterTable
ALTER TABLE "ApprovalRequest" ADD COLUMN     "directorateId" TEXT,
ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "level" TEXT NOT NULL DEFAULT 'INSTITUTION',
ADD COLUMN     "startIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "travellerId" TEXT,
ADD COLUMN     "unitId" TEXT,
ALTER COLUMN "institutionId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ApprovalRequest_groupId_status_idx" ON "ApprovalRequest"("groupId", "status");

-- CreateIndex
CREATE INDEX "ApprovalRequest_directorateId_status_idx" ON "ApprovalRequest"("directorateId", "status");


-- Backfill: existing requests (bills) carry their institution's unit, group
-- and directorate.
UPDATE "ApprovalRequest" r
SET "unitId" = i."unitId", "groupId" = u."groupId", "directorateId" = g."directorateId"
FROM "Institution" i
JOIN "Unit" u ON u."id" = i."unitId"
JOIN "Group" g ON g."id" = u."groupId"
WHERE r."institutionId" = i."id";
