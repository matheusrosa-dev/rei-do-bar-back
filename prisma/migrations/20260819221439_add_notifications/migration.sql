-- CreateEnum
CREATE TYPE "NotificationTarget" AS ENUM ('ALL', 'NO_ORDERS', 'ABANDONED_CART', 'INACTIVE_30_DAYS', 'SINGLE_ORDER');

-- CreateEnum
CREATE TYPE "NotificationAction" AS ENUM ('REDIRECT_TO_ORDERS');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('SENT', 'FAILED');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "target" "NotificationTarget" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "action" "NotificationAction",
    "status" "NotificationStatus" NOT NULL,
    "customers_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
