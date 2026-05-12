-- CreateTable
CREATE TABLE "phone_deletion_logs" (
    "id" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedById" TEXT NOT NULL,
    "formerPhoneId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "capacity" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT '',
    "imei" TEXT NOT NULL,
    "sellingPrice" DOUBLE PRECISION NOT NULL,
    "purchasePrice" DOUBLE PRECISION,
    "status" TEXT NOT NULL,
    "photos" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT NOT NULL DEFAULT '',
    "addedAt" TIMESTAMP(3) NOT NULL,
    "addedById" TEXT NOT NULL,

    CONSTRAINT "phone_deletion_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "phone_deletion_logs_deletedAt_idx" ON "phone_deletion_logs"("deletedAt");

-- CreateIndex
CREATE INDEX "phone_deletion_logs_imei_idx" ON "phone_deletion_logs"("imei");

-- AddForeignKey
ALTER TABLE "phone_deletion_logs" ADD CONSTRAINT "phone_deletion_logs_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_deletion_logs" ADD CONSTRAINT "phone_deletion_logs_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
