-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "cancelled_at" TIMESTAMP(3);

-- Backfill dos pedidos já cancelados. O updated_at é a única aproximação
-- disponível, mas ele é sobrescrito por qualquer escrita posterior — inclusive
-- a reatribuição de entregador, que o admin faz em pedidos já CANCELLED. O
-- board do admin lê esta coluna através de uma janela de 10 horas, então um
-- pedido antigo com o updated_at bumpado dentro dela reapareceria como
-- recém-cancelado. Por isso o backfill para na borda da janela: fora dela o
-- valor é histórico e inofensivo, dentro dela preferimos nulo a um número
-- inventado.
UPDATE "orders"
SET "cancelled_at" = "updated_at"
WHERE "status" = 'CANCELLED'
  AND "updated_at" < NOW() - INTERVAL '10 hours';
