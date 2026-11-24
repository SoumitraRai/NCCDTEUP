-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwoFactor" (
    "id" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TwoFactor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Directorate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Directorate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "directorateId" TEXT NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Institution" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "publicApproved" BOOLEAN NOT NULL DEFAULT false,
    "unitId" TEXT NOT NULL,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CadetProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enrollmentNumber" TEXT NOT NULL,
    "details" JSONB NOT NULL,

    CONSTRAINT "CadetProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "details" JSONB NOT NULL,

    CONSTRAINT "StaffProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "eventDate" DATE NOT NULL,
    "notes" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingSession" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "attendance" INTEGER NOT NULL,
    "category" TEXT NOT NULL,

    CONSTRAINT "TrainingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "privateDetails" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Publication" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "currentRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Publication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationRevision" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "institutionDisplayName" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "eventDate" DATE NOT NULL,
    "consentId" TEXT,
    "mediaIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "authorId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "publishAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicationRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicContent" (
    "publicId" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "institutionDisplayName" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "eventDate" DATE NOT NULL,
    "publicationDate" TIMESTAMP(3) NOT NULL,
    "publishAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "media" JSONB NOT NULL,

    CONSTRAINT "PublicContent_pkey" PRIMARY KEY ("publicId")
);

-- CreateTable
CREATE TABLE "Notice" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "translationGroupId" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "publishAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "authorId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalizedContent" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LocalizedContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitmentEnquiry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleteAfter" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruitmentEnquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "evidenceAttachmentId" TEXT,
    "permissionConfirmed" BOOLEAN NOT NULL,
    "guardianRequired" BOOLEAN NOT NULL,
    "guardianConfirmed" BOOLEAN NOT NULL,
    "synthetic" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "declaredType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUARANTINED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scannedAt" TIMESTAMP(3),

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialRatePolicy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE NOT NULL,
    "ratePaise" BIGINT NOT NULL,
    "capPaise" BIGINT NOT NULL,
    "partialMonthRule" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "synthetic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialRatePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "attendance" INTEGER NOT NULL,
    "sessions" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "totalPaise" BIGINT NOT NULL DEFAULT 0,
    "paidPaise" BIGINT NOT NULL DEFAULT 0,
    "snapshot" JSONB,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimLineItem" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "totalPaise" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalAction" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "reference" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reversalOf" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" TEXT NOT NULL,
    "inApp" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Discussion" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Discussion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuthRateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "AuthRateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE INDEX "TwoFactor_userId_idx" ON "TwoFactor"("userId");

-- CreateIndex
CREATE INDEX "RoleAssignment_userId_active_idx" ON "RoleAssignment"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CadetProfile_userId_key" ON "CadetProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CadetProfile_enrollmentNumber_key" ON "CadetProfile"("enrollmentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_userId_key" ON "StaffProfile"("userId");

-- CreateIndex
CREATE INDEX "Visit_institutionId_createdAt_idx" ON "Visit"("institutionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Publication_slug_key" ON "Publication"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PublicationRevision_publicationId_number_key" ON "PublicationRevision"("publicationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "PublicContent_publicationId_key" ON "PublicContent"("publicationId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicContent_slug_key" ON "PublicContent"("slug");

-- CreateIndex
CREATE INDEX "PublicContent_locale_category_publishAt_idx" ON "PublicContent"("locale", "category", "publishAt");

-- CreateIndex
CREATE UNIQUE INDEX "LocalizedContent_resourceId_locale_key" ON "LocalizedContent"("resourceId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_publicKey_key" ON "MediaAsset"("publicKey");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_objectKey_key" ON "Attachment"("objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialRatePolicy_kind_category_version_key" ON "FinancialRatePolicy"("kind", "category", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_idempotencyKey_key" ON "Claim"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Claim_institutionId_state_createdAt_idx" ON "Claim"("institutionId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "Claim_ownerId_periodStart_periodEnd_idx" ON "Claim"("ownerId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalAction_claimId_version_key" ON "ApprovalAction"("claimId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_idempotencyKey_key" ON "PaymentRecord"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_reversalOf_key" ON "PaymentRecord"("reversalOf");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthRateLimit_key_key" ON "AuthRateLimit"("key");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwoFactor" ADD CONSTRAINT "TwoFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_directorateId_fkey" FOREIGN KEY ("directorateId") REFERENCES "Directorate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Institution" ADD CONSTRAINT "Institution_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationRevision" ADD CONSTRAINT "PublicationRevision_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicContent" ADD CONSTRAINT "PublicContent_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimLineItem" ADD CONSTRAINT "ClaimLineItem_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalAction" ADD CONSTRAINT "ApprovalAction_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
