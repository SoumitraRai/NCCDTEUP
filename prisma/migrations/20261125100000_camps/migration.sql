
-- CreateTable
CREATE TABLE "Camp" (
    "id" TEXT NOT NULL,
    "trainingYear" TEXT NOT NULL,
    "catcNo" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "directorateId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "plannedStrength" INTEGER NOT NULL,
    "details" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "cancelReason" TEXT NOT NULL DEFAULT '',
    "reportStatus" TEXT NOT NULL DEFAULT 'NONE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Camp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampAllocation" (
    "id" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "attended" INTEGER,

    CONSTRAINT "CampAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampReportSubmission" (
    "id" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "submittedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decision" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "remarks" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "CampReportSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Camp_trainingYear_startDate_idx" ON "Camp"("trainingYear", "startDate");

-- CreateIndex
CREATE INDEX "Camp_unitId_idx" ON "Camp"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "Camp_groupId_trainingYear_catcNo_key" ON "Camp"("groupId", "trainingYear", "catcNo");

-- CreateIndex
CREATE INDEX "CampAllocation_unitId_idx" ON "CampAllocation"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "CampAllocation_campId_unitId_key" ON "CampAllocation"("campId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "CampReportSubmission_campId_round_key" ON "CampReportSubmission"("campId", "round");

-- AddForeignKey
ALTER TABLE "Camp" ADD CONSTRAINT "Camp_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Camp" ADD CONSTRAINT "Camp_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampAllocation" ADD CONSTRAINT "CampAllocation_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampAllocation" ADD CONSTRAINT "CampAllocation_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampReportSubmission" ADD CONSTRAINT "CampReportSubmission_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Facts the service also checks, kept true in the database.
ALTER TABLE "Camp" ADD CONSTRAINT "Camp_dates_check" CHECK ("endDate" >= "startDate");
ALTER TABLE "Camp" ADD CONSTRAINT "Camp_strength_check" CHECK ("plannedStrength" > 0);
ALTER TABLE "CampAllocation" ADD CONSTRAINT "CampAllocation_seats_check" CHECK ("seats" >= 0 AND ("attended" IS NULL OR "attended" >= 0));
