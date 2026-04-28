ALTER TABLE "MenuItem"
  ADD COLUMN "priceMin" DECIMAL(10, 2),
  ADD COLUMN "priceMax" DECIMAL(10, 2),
  ADD COLUMN "quoteRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "emergencyEligible" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "serviceArea" TEXT,
  ADD COLUMN "intakeQuestions" JSONB;
