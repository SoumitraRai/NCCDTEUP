-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "head" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "officer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "role" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sort" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "RoleAssignment" ADD COLUMN     "directorateId" TEXT,
ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "level" TEXT NOT NULL DEFAULT 'INSTITUTION',
ADD COLUMN     "unitId" TEXT,
ALTER COLUMN "institutionId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_directorateId_fkey" FOREIGN KEY ("directorateId") REFERENCES "Directorate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill: move formation-level roles from their borrowed institution to
-- the formation itself.
UPDATE "RoleAssignment" r SET "level" = 'UNIT', "unitId" = i."unitId", "institutionId" = NULL
  FROM "Institution" i WHERE r."institutionId" = i."id" AND r."role" = 'CO';
UPDATE "RoleAssignment" r SET "level" = 'GROUP', "groupId" = u."groupId", "institutionId" = NULL
  FROM "Institution" i JOIN "Unit" u ON u."id" = i."unitId" WHERE r."institutionId" = i."id" AND r."role" = 'GROUP';
UPDATE "RoleAssignment" r SET "level" = 'DIRECTORATE', "directorateId" = g."directorateId", "institutionId" = NULL
  FROM "Institution" i JOIN "Unit" u ON u."id" = i."unitId" JOIN "Group" g ON g."id" = u."groupId"
  WHERE r."institutionId" = i."id" AND r."role" = 'ADMIN';

-- Exactly one anchor, and it matches the level.
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_one_anchor" CHECK (
  ("level" = 'INSTITUTION' AND "institutionId" IS NOT NULL AND "unitId" IS NULL AND "groupId" IS NULL AND "directorateId" IS NULL) OR
  ("level" = 'UNIT' AND "unitId" IS NOT NULL AND "institutionId" IS NULL AND "groupId" IS NULL AND "directorateId" IS NULL) OR
  ("level" = 'GROUP' AND "groupId" IS NOT NULL AND "institutionId" IS NULL AND "unitId" IS NULL AND "directorateId" IS NULL) OR
  ("level" = 'DIRECTORATE' AND "directorateId" IS NOT NULL AND "institutionId" IS NULL AND "unitId" IS NULL AND "groupId" IS NULL)
);
