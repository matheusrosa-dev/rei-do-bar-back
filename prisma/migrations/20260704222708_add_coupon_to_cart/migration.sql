-- AlterTable
ALTER TABLE "cart" ADD COLUMN     "coupon_id" TEXT;

-- AddForeignKey
ALTER TABLE "cart" ADD CONSTRAINT "cart_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
