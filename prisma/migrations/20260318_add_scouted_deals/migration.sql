-- CreateTable
CREATE TABLE "ScoutedDeal" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'Boston',
    "state" TEXT NOT NULL DEFAULT 'MA',
    "zip" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "bedrooms" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bathrooms" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sqft" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL DEFAULT 'Condo',
    "source" TEXT,
    "sourceUrl" TEXT,
    "highlight" TEXT,
    "estimatedRent" DOUBLE PRECISION,
    "estimatedCap" DOUBLE PRECISION,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "promotedId" TEXT,

    CONSTRAINT "ScoutedDeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScoutedDeal_dismissed_idx" ON "ScoutedDeal"("dismissed");

-- CreateIndex
CREATE INDEX "ScoutedDeal_createdAt_idx" ON "ScoutedDeal"("createdAt");
