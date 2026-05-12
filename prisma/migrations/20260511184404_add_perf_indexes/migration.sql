-- CreateIndex
CREATE INDEX "activity_logs_userId_idx" ON "activity_logs"("userId");

-- CreateIndex
CREATE INDEX "activity_logs_timestamp_idx" ON "activity_logs"("timestamp");

-- CreateIndex
CREATE INDEX "alerts_status_idx" ON "alerts"("status");

-- CreateIndex
CREATE INDEX "alerts_type_relatedId_idx" ON "alerts"("type", "relatedId");

-- CreateIndex
CREATE INDEX "payments_saleId_idx" ON "payments"("saleId");

-- CreateIndex
CREATE INDEX "payments_date_idx" ON "payments"("date");

-- CreateIndex
CREATE INDEX "phone_exits_createdById_idx" ON "phone_exits"("createdById");

-- CreateIndex
CREATE INDEX "phone_exits_status_idx" ON "phone_exits"("status");

-- CreateIndex
CREATE INDEX "phones_addedById_idx" ON "phones"("addedById");

-- CreateIndex
CREATE INDEX "phones_status_idx" ON "phones"("status");

-- CreateIndex
CREATE INDEX "sales_sellerId_idx" ON "sales"("sellerId");

-- CreateIndex
CREATE INDEX "sales_paymentStatus_idx" ON "sales"("paymentStatus");

-- CreateIndex
CREATE INDEX "sales_clientId_idx" ON "sales"("clientId");

-- CreateIndex
CREATE INDEX "sales_date_idx" ON "sales"("date");
