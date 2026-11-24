-- CreateTable
CREATE TABLE "RegistrationRequest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" TEXT NOT NULL,
    "appointmentCode" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT NOT NULL DEFAULT '',
    "userId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleteAfter" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegistrationRequest_status_institutionId_idx" ON "RegistrationRequest"("status", "institutionId");

-- CreateIndex
CREATE INDEX "RegistrationRequest_email_idx" ON "RegistrationRequest"("email");
