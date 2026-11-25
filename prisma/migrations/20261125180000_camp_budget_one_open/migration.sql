-- DropIndex
DROP INDEX "CampBudget_campId_stage_key";

-- CreateIndex
CREATE INDEX "CampBudget_campId_stage_idx" ON "CampBudget"("campId", "stage");


-- One open budget per camp and stage; cancelled and rejected ones stay as history.
CREATE UNIQUE INDEX "CampBudget_open_stage_key" ON "CampBudget"("campId", "stage") WHERE "status" NOT IN ('CANCELLED', 'REJECTED');
