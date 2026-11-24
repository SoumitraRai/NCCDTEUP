-- AlterTable
ALTER TABLE "RegistrationRequest" ADD COLUMN     "directorateId" TEXT,
ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'MEMBER',
ADD COLUMN     "level" TEXT NOT NULL DEFAULT 'INSTITUTION',
ADD COLUMN     "unitId" TEXT,
ALTER COLUMN "institutionId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "requireTwoFactor" BOOLEAN NOT NULL DEFAULT false;

