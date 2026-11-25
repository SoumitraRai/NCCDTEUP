-- CreateTable
CREATE TABLE "CampBudget" (
    "id" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "cadets" INTEGER NOT NULL,
    "anos" INTEGER NOT NULL,
    "staff" INTEGER NOT NULL,
    "days" INTEGER NOT NULL,
    "demandedPaise" BIGINT NOT NULL,
    "sanctionedPaise" BIGINT,
    "createdById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampBudgetLine" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "head" TEXT NOT NULL,
    "quantity" INTEGER,
    "amountPaise" BIGINT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "CampBudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampBudgetSubmission" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampBudgetSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampBudget_status_idx" ON "CampBudget"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CampBudget_campId_stage_key" ON "CampBudget"("campId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "CampBudgetLine_budgetId_head_key" ON "CampBudgetLine"("budgetId", "head");

-- CreateIndex
CREATE UNIQUE INDEX "CampBudgetSubmission_budgetId_cycle_key" ON "CampBudgetSubmission"("budgetId", "cycle");

-- AddForeignKey
ALTER TABLE "CampBudget" ADD CONSTRAINT "CampBudget_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampBudgetLine" ADD CONSTRAINT "CampBudgetLine_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "CampBudget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampBudgetSubmission" ADD CONSTRAINT "CampBudgetSubmission_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "CampBudget"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Facts the service also checks, kept true in the database.
ALTER TABLE "CampBudget" ADD CONSTRAINT "CampBudget_stage_check" CHECK ("stage" IN ('INITIAL','REVISED','FINAL'));
ALTER TABLE "CampBudget" ADD CONSTRAINT "CampBudget_amounts_check" CHECK ("demandedPaise" >= 0 AND ("sanctionedPaise" IS NULL OR ("sanctionedPaise" >= 0 AND "sanctionedPaise" <= "demandedPaise")) AND LEAST("cadets","anos","staff","days") >= 0);
ALTER TABLE "CampBudgetLine" ADD CONSTRAINT "CampBudgetLine_amount_check" CHECK ("amountPaise" >= 0 AND ("quantity" IS NULL OR "quantity" >= 0));
