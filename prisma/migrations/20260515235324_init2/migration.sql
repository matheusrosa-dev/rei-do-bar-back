/*
  Warnings:

  - Changed the type of `key` on the `settings` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "SettingKey" AS ENUM ('DELIVERY_FEE');

-- AlterTable
ALTER TABLE "settings" DROP COLUMN "key",
ADD COLUMN     "key" "SettingKey" NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");
