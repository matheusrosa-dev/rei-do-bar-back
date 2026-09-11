-- AlterTable
ALTER TABLE "category_groups" ADD COLUMN     "all_products_image_url" TEXT NOT NULL DEFAULT 'https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/categories/all-products.png',
ADD COLUMN     "promotions_image_url" TEXT NOT NULL DEFAULT 'https://vugdpvueifusbgzkzroh.supabase.co/storage/v1/object/public/categories/promotions.png';

ALTER TABLE "category_groups" ALTER COLUMN "all_products_image_url" DROP DEFAULT,
ALTER COLUMN "promotions_image_url" DROP DEFAULT;
