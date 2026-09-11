-- AlterEnum
-- O valor CASH deixa de ser aceito como forma de pagamento.
-- Linhas legadas com CASH sao convertidas para PIX no cast.
BEGIN;
CREATE TYPE "PaymentType_new" AS ENUM ('CREDIT_CARD', 'DEBIT_CARD', 'PIX');
ALTER TABLE "orders" ALTER COLUMN "payment_type" TYPE "PaymentType_new" USING (CASE "payment_type"::text WHEN 'CASH' THEN 'PIX' ELSE "payment_type"::text END::"PaymentType_new");
ALTER TYPE "PaymentType" RENAME TO "PaymentType_old";
ALTER TYPE "PaymentType_new" RENAME TO "PaymentType";
DROP TYPE "PaymentType_old";
COMMIT;
