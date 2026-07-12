/*
  Warnings:

  - The values [COUPON] on the enum `SettingType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "SettingType_new" AS ENUM ('CURRENCY', 'TEXT', 'PHONE');
ALTER TABLE "settings" ALTER COLUMN "type" TYPE "SettingType_new" USING ("type"::text::"SettingType_new");
ALTER TYPE "SettingType" RENAME TO "SettingType_old";
ALTER TYPE "SettingType_new" RENAME TO "SettingType";
DROP TYPE "public"."SettingType_old";
COMMIT;
