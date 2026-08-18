-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "delivered_at" TIMESTAMP(3);

-- Backfill dos pedidos já entregues. O updated_at é a única aproximação
-- disponível, mas ele é sobrescrito por qualquer escrita posterior — inclusive
-- a reatribuição de entregador, que o admin faz em pedidos já DELIVERED. Um
-- pedido antigo reatribuído há pouco entraria na janela de 10 horas da contagem
-- e creditaria ao entregador uma entrega que ele não fez. Por isso o backfill
-- para na borda da janela: fora dela o valor é histórico e inofensivo, dentro
-- dela preferimos nulo a um número inventado.
UPDATE "orders"
SET "delivered_at" = "updated_at"
WHERE "status" = 'DELIVERED'
  AND "updated_at" < NOW() - INTERVAL '10 hours';
