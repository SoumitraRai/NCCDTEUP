/*
  Warnings:

  - Added the required column `endsAt` to the `Visit` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startsAt` to the `Visit` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'RETURNED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalOutcome" AS ENUM ('SUBMITTED', 'RECOMMENDED', 'NOT_RECOMMENDED', 'APPROVED', 'RETURNED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Claim" ADD COLUMN     "claimedPaise" BIGINT;

-- AlterTable
ALTER TABLE "Institution" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "latitude" DECIMAL(6,3),
ADD COLUMN     "longitude" DECIMAL(6,3),
ADD COLUMN     "vacancy" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "RoleAssignment" ADD COLUMN     "appointmentCode" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "autoRecommend" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "cadetsPresent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "endsAt" TIMESTAMP(3),
ADD COLUMN     "periods" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "purpose" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "startsAt" TIMESTAMP(3),
ADD COLUMN     "visitorAppointment" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "visitorName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "visitorRank" TEXT NOT NULL DEFAULT '';

-- Backfill: existing visits become a nominal 10:00-12:00 IST (04:30-06:30 UTC) record on their event date.
UPDATE "Visit" SET "startsAt" = "eventDate" + INTERVAL '4 hours 30 minutes', "endsAt" = "eventDate" + INTERVAL '6 hours 30 minutes';
ALTER TABLE "Visit" ALTER COLUMN "startsAt" SET NOT NULL, ALTER COLUMN "endsAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "Appointment" (
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "level" TEXT NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "TrainingYear" (
    "label" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,

    CONSTRAINT "TrainingYear_pkey" PRIMARY KEY ("label")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshmentDetail" (
    "claimId" TEXT NOT NULL,
    "trainingStart" TIMESTAMP(3) NOT NULL,
    "trainingEnd" TIMESTAMP(3) NOT NULL,
    "instructorName" TEXT NOT NULL,
    "instructorAppointment" TEXT NOT NULL,
    "instructorMobileEnc" TEXT NOT NULL,
    "cadetsPresent" INTEGER NOT NULL,
    "periods" INTEGER NOT NULL,
    "visitId" TEXT,
    "paymentComments" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "RefreshmentDetail_pkey" PRIMARY KEY ("claimId")
);

-- CreateTable
CREATE TABLE "HonorariumDetail" (
    "claimId" TEXT NOT NULL,
    "instructorName" TEXT NOT NULL,
    "instructorRank" TEXT NOT NULL,
    "instructorAppointment" TEXT NOT NULL,
    "months" INTEGER NOT NULL,

    CONSTRAINT "HonorariumDetail_pkey" PRIMARY KEY ("claimId")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "workflow" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "routeVersion" INTEGER NOT NULL,
    "stageIndex" INTEGER NOT NULL DEFAULT 0,
    "cycle" INTEGER NOT NULL DEFAULT 1,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalStep" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL,
    "stageIndex" INTEGER NOT NULL,
    "stageCode" TEXT NOT NULL,
    "outcome" "ApprovalOutcome" NOT NULL,
    "actorId" TEXT NOT NULL,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_SubjectToVisit" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_SubjectToVisit_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_RefreshmentDetailToSubject" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_RefreshmentDetailToSubject_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subject_name_key" ON "Subject"("name");

-- CreateIndex
CREATE INDEX "ApprovalRequest_status_stageIndex_idx" ON "ApprovalRequest"("status", "stageIndex");

-- CreateIndex
CREATE INDEX "ApprovalRequest_institutionId_status_idx" ON "ApprovalRequest"("institutionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRequest_workflow_resourceId_key" ON "ApprovalRequest"("workflow", "resourceId");

-- CreateIndex
CREATE INDEX "ApprovalStep_requestId_createdAt_idx" ON "ApprovalStep"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "_SubjectToVisit_B_index" ON "_SubjectToVisit"("B");

-- CreateIndex
CREATE INDEX "_RefreshmentDetailToSubject_B_index" ON "_RefreshmentDetailToSubject"("B");

-- CreateIndex
CREATE INDEX "Institution_unitId_active_idx" ON "Institution"("unitId", "active");

-- CreateIndex
CREATE INDEX "Visit_startsAt_idx" ON "Visit"("startsAt");

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_appointmentCode_fkey" FOREIGN KEY ("appointmentCode") REFERENCES "Appointment"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshmentDetail" ADD CONSTRAINT "RefreshmentDetail_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HonorariumDetail" ADD CONSTRAINT "HonorariumDetail_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SubjectToVisit" ADD CONSTRAINT "_SubjectToVisit_A_fkey" FOREIGN KEY ("A") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SubjectToVisit" ADD CONSTRAINT "_SubjectToVisit_B_fkey" FOREIGN KEY ("B") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RefreshmentDetailToSubject" ADD CONSTRAINT "_RefreshmentDetailToSubject_A_fkey" FOREIGN KEY ("A") REFERENCES "RefreshmentDetail"("claimId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RefreshmentDetailToSubject" ADD CONSTRAINT "_RefreshmentDetailToSubject_B_fkey" FOREIGN KEY ("B") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
