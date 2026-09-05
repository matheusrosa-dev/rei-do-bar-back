import { Expose, Type } from "class-transformer";
import { OrdersDto } from "./orders.dto";

class OrdersPageMetaDto {
  @Expose()
  total!: number;

  @Expose()
  page!: number;

  @Expose()
  limit!: number;

  @Expose()
  totalPages!: number;
}

export class PaginatedOrdersDto {
  @Expose()
  @Type(() => OrdersDto)
  items!: OrdersDto[];

  @Expose()
  @Type(() => OrdersPageMetaDto)
  meta!: OrdersPageMetaDto;
}
