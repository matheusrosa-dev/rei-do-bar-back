-- AlterEnum
-- O valor CARD e substituido por CREDIT_CARD e DEBIT_CARD.
-- Linhas legadas com CARD sao convertidas para CREDIT_CARD no cast.
BEGIN;
CREATE TYPE "PaymentType_new" AS ENUM ('CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'PIX');
ALTER TABLE "orders" ALTER COLUMN "payment_type" TYPE "PaymentType_new" USING (CASE "payment_type"::text WHEN 'CARD' THEN 'CREDIT_CARD' ELSE "payment_type"::text END::"PaymentType_new");
ALTER TYPE "PaymentType" RENAME TO "PaymentType_old";
ALTER TYPE "PaymentType_new" RENAME TO "PaymentType";
DROP TYPE "PaymentType_old";
COMMIT;
