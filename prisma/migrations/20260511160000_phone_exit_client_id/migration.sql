-- AlterTable
ALTER TABLE "phone_exits" ADD COLUMN "clientId" TEXT;

-- CreateIndex
CREATE INDEX "phone_exits_clientId_idx" ON "phone_exits"("clientId");

-- AddForeignKey
ALTER TABLE "phone_exits" ADD CONSTRAINT "phone_exits_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
