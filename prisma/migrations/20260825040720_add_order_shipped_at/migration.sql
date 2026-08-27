-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "shipped_at" TIMESTAMP(3);

-- Sem backfill. Diferente de delivered_at/cancelled_at, o updated_at não
-- aproxima o despacho: SHIPPED não é terminal, então em pedidos já entregues
-- ou cancelados o updated_at é da transição seguinte, não da saída para
-- entrega. Nos que ainda estão em SHIPPED ele seria uma aproximação, mas a
-- reatribuição de entregador o sobrescreve, então nem lá o valor é confiável.
-- Todo o histórico nasce nulo — "não sabemos" — e só as transições novas
-- passam a carimbar. O board ordena a coluna SHIPPED por shipped_at com
-- NULLS FIRST justamente para que esses pedidos antigos fiquem no topo da
-- fila, onde já estavam por created_at. Nenhuma query filtra essa coluna por
-- janela; se algum dia filtrar, os pedidos pré-migration somem dela.
