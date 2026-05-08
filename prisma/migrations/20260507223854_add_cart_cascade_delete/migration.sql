/*
  Warnings:

  - You are about to drop the column `deleted_at` on the `addresses` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_at` on the `cart` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_at` on the `cart_items` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_at` on the `deliverer_tokens` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_at` on the `deliverers` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "cart" DROP CONSTRAINT "cart_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "cart_items" DROP CONSTRAINT "cart_items_cart_id_fkey";

-- AlterTable
ALTER TABLE "addresses" DROP COLUMN "deleted_at";

-- AlterTable
ALTER TABLE "cart" DROP COLUMN "deleted_at";

-- AlterTable
ALTER TABLE "cart_items" DROP COLUMN "deleted_at";

-- AlterTable
ALTER TABLE "deliverer_tokens" DROP COLUMN "deleted_at";

-- AlterTable
ALTER TABLE "deliverers" DROP COLUMN "deleted_at";

-- AddForeignKey
ALTER TABLE "cart" ADD CONSTRAINT "cart_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
