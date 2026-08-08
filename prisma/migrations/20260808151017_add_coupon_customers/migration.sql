-- CreateTable
CREATE TABLE "coupon_customers" (
    "coupon_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_customers_pkey" PRIMARY KEY ("coupon_id","customer_id")
);

-- CreateIndex
CREATE INDEX "coupon_customers_customer_id_idx" ON "coupon_customers"("customer_id");

-- AddForeignKey
ALTER TABLE "coupon_customers" ADD CONSTRAINT "coupon_customers_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_customers" ADD CONSTRAINT "coupon_customers_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
