-- AlterTable
ALTER TABLE "phone_deletion_logs" ALTER COLUMN "imei" DROP NOT NULL;

-- AlterTable
ALTER TABLE "phones" ALTER COLUMN "imei" DROP NOT NULL;
