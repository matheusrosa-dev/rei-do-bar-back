-- CreateIndex
CREATE INDEX "orders_status_delivered_at_idx" ON "orders"("status", "delivered_at");

-- CreateIndex
CREATE INDEX "orders_status_cancelled_at_idx" ON "orders"("status", "cancelled_at");
