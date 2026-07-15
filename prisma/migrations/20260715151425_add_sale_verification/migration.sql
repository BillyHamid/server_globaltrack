-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "verificationComment" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "verificationStatus" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedById" TEXT;

-- CreateIndex
CREATE INDEX "sales_verificationStatus_idx" ON "sales"("verificationStatus");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
