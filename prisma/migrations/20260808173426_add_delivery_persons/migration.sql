-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "delivery_person_id" TEXT;

-- CreateTable
CREATE TABLE "delivery_persons" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "address_street" TEXT NOT NULL,
    "address_number" TEXT NOT NULL,
    "address_neighborhood" TEXT NOT NULL,
    "address_zip_code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_persons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_persons_phone_key" ON "delivery_persons"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_persons_cpf_key" ON "delivery_persons"("cpf");

-- CreateIndex
CREATE INDEX "orders_delivery_person_id_idx" ON "orders"("delivery_person_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_person_id_fkey" FOREIGN KEY ("delivery_person_id") REFERENCES "delivery_persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
