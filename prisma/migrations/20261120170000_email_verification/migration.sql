-- AlterTable
ALTER TABLE "RegistrationRequest" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifyExpiresAt" TIMESTAMP(3),
ADD COLUMN     "verifyTokenHash" TEXT;

-- CreateTable
CREATE TABLE "OutboundEmail" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deleteAfter" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutboundEmail_status_createdAt_idx" ON "OutboundEmail"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationRequest_verifyTokenHash_key" ON "RegistrationRequest"("verifyTokenHash");

