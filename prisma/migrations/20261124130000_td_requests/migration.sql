-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "link" TEXT,
ADD COLUMN     "resourceId" TEXT;

-- CreateTable
CREATE TABLE "TdRequest" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "travellerId" TEXT,
    "travellerName" TEXT NOT NULL,
    "travellerRank" TEXT NOT NULL DEFAULT '',
    "travellerPost" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "unitId" TEXT,
    "groupId" TEXT,
    "directorateId" TEXT NOT NULL,
    "fromPlace" TEXT NOT NULL,
    "toPlace" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "startHalf" TEXT NOT NULL,
    "endDate" DATE NOT NULL,
    "endHalf" TEXT NOT NULL,
    "halfDays" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "ownArrangement" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TdRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TdSubmission" (
    "id" TEXT NOT NULL,
    "tdId" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TdSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TdRequest_status_endDate_idx" ON "TdRequest"("status", "endDate");

-- CreateIndex
CREATE INDEX "TdRequest_groupId_idx" ON "TdRequest"("groupId");

-- CreateIndex
CREATE INDEX "TdRequest_directorateId_idx" ON "TdRequest"("directorateId");

-- CreateIndex
CREATE INDEX "TdRequest_createdById_idx" ON "TdRequest"("createdById");

-- CreateIndex
CREATE INDEX "TdRequest_travellerId_idx" ON "TdRequest"("travellerId");

-- CreateIndex
CREATE UNIQUE INDEX "TdSubmission_tdId_cycle_key" ON "TdSubmission"("tdId", "cycle");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "TdSubmission" ADD CONSTRAINT "TdSubmission_tdId_fkey" FOREIGN KEY ("tdId") REFERENCES "TdRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

