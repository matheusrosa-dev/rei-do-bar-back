import {
  Order,
  OrderItem,
  Product,
} from "@shared/database/prisma/generated/client";
import { OrderStatus } from "@shared/database/prisma/generated/enums";

// A janela de atividade recente do board. As migrations que ajustaram os
// carimbos de delivered_at / cancelled_at cortaram exatamente nesta borda: as
// linhas de dentro dela ficaram nulas porque o valor disponível era aproximado.
// Alargar esta janela sem uma migration nova traz aquelas aproximações de volta
// para o board como se fossem finalizações recentes.
export const FINALIZED_WINDOW_HOURS = 10;

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

export type OrderWithItems = Order & {
  items: Array<OrderItem & { product: Product }>;
};

export type OrderSortValueSource = {
  deliveryFee: number;
  couponDiscount: number;
  items: Array<Pick<OrderItem, "price" | "compareAtPrice" | "quantity">>;
};
