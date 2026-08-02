import {
  Order,
  OrderItem,
  Product,
} from "@shared/database/prisma/generated/client";
import { OrderStatus } from "@shared/database/prisma/generated/enums";

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
