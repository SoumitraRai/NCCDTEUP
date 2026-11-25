-- CreateTable
CREATE TABLE "CadetStrength" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "trainingYear" TEXT NOT NULL,
    "authJD" INTEGER NOT NULL DEFAULT 0,
    "authJW" INTEGER NOT NULL DEFAULT 0,
    "authSD" INTEGER NOT NULL DEFAULT 0,
    "authSW" INTEGER NOT NULL DEFAULT 0,
    "enrJD" INTEGER NOT NULL DEFAULT 0,
    "enrJW" INTEGER NOT NULL DEFAULT 0,
    "enrSD" INTEGER NOT NULL DEFAULT 0,
    "enrSW" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CadetStrength_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CadetStrength_institutionId_trainingYear_key" ON "CadetStrength"("institutionId", "trainingYear");

-- AddForeignKey
ALTER TABLE "CadetStrength" ADD CONSTRAINT "CadetStrength_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Counts are never negative.
ALTER TABLE "CadetStrength" ADD CONSTRAINT "CadetStrength_counts_check" CHECK (LEAST("authJD","authJW","authSD","authSW","enrJD","enrJW","enrSD","enrSW") >= 0);
