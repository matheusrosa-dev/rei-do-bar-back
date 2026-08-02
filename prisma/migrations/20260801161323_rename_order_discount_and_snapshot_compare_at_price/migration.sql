-- AlterTable
ALTER TABLE "orders" RENAME COLUMN "discount" TO "coupon_discount";

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN "compare_at_price" INTEGER;
