-- CreateTable
CREATE TABLE "delivery_person_sessions" (
    "id" TEXT NOT NULL,
    "delivery_person_id" TEXT NOT NULL,
    "hashed_access_token" TEXT NOT NULL,
    "hashed_refresh_token" TEXT NOT NULL,
    "access_token_expires_at" TIMESTAMP(3) NOT NULL,
    "refresh_token_expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_person_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_person_sessions_delivery_person_id_key" ON "delivery_person_sessions"("delivery_person_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_person_sessions_hashed_access_token_key" ON "delivery_person_sessions"("hashed_access_token");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_person_sessions_hashed_refresh_token_key" ON "delivery_person_sessions"("hashed_refresh_token");

-- AddForeignKey
ALTER TABLE "delivery_person_sessions" ADD CONSTRAINT "delivery_person_sessions_delivery_person_id_fkey" FOREIGN KEY ("delivery_person_id") REFERENCES "delivery_persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
