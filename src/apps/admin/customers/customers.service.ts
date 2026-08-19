import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import { Prisma } from "@shared/database/prisma/generated/client";
import { FindAllCustomersDto } from "./dtos";
import { CustomerWithRelations } from "./helpers";
import {
  isForeignKeyConstraintViolation,
  isRecordNotFound,
} from "@shared/helpers/prisma-errors";
import { computeOrderTotals } from "@shared/helpers/products-totals";

@Injectable()
export class AdminCustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async removeCustomer(customerId: string) {
    try {
      await this.prisma.$transaction(async (tx) => {
        // Bloqueia a linha do cliente para serializar contra a criação
        // concorrente de pedidos e garantir que a contagem seja consistente
        // com a exclusão.
        const [locked] = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM customers WHERE id = ${customerId} FOR UPDATE`;

        if (!locked) {
          throw new AppException(
            AppException.errorCodes.adminCustomers.CUSTOMER_NOT_FOUND,
            "Cliente não encontrado.",
            AppException.HttpStatus.NOT_FOUND,
          );
        }

        const ordersCount = await tx.order.count({
          where: { customerId },
        });

        if (ordersCount > 0) {
          throw new AppException(
            AppException.errorCodes.adminCustomers.CUSTOMER_HAS_ORDERS,
            "Não é possível excluir um cliente que possui pedidos.",
            AppException.HttpStatus.CONFLICT,
          );
        }

        await tx.customer.delete({ where: { id: customerId } });
      });
    } catch (error) {
      if (isForeignKeyConstraintViolation(error)) {
        throw new AppException(
          AppException.errorCodes.adminCustomers.CUSTOMER_HAS_ORDERS,
          "Não é possível excluir um cliente que possui pedidos.",
          AppException.HttpStatus.CONFLICT,
        );
      }

      throw error;
    }
  }

  async activateCustomer(customerId: string) {
    return this.updateCustomerOrThrow(customerId, { isActive: true });
  }

  async deactivateCustomer(customerId: string) {
    return this.updateCustomerOrThrow(customerId, { isActive: false });
  }

  async findAll(dto: FindAllCustomersDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    const direction = dto.sortDirection ?? "desc";

    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.searchTerm && {
        OR: [
          { name: { contains: dto.searchTerm, mode: "insensitive" } },
          { phone: { contains: dto.searchTerm, mode: "insensitive" } },
          { id: { contains: dto.searchTerm, mode: "insensitive" } },
        ],
      }),
    };

    if (dto.sortKey === "deliveredOrdersCount") {
      return this.findAllSortedByDeliveredOrders(
        where,
        page,
        limit,
        skip,
        direction,
      );
    }

    const orderBy: Prisma.CustomerOrderByWithRelationInput[] =
      dto.sortKey === "allOrdersCount"
        ? [{ orders: { _count: direction } }, { id: "desc" }]
        : [{ createdAt: "desc" }, { id: "desc" }];

    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          addresses: { where: { isMain: true } },
          orders: true,
        },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      items: items.map((item) => this.mapCustomerResult(item)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findAllSimple() {
    const customers = await this.prisma.customer.findMany({
      where: {
        deletedAt: null,
        isActive: true,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });

    return customers;
  }

  async findCustomerById(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: {
        id: customerId,
      },
      include: {
        addresses: true,
        orders: {
          include: {
            items: true,
          },
          orderBy: [{ createdAt: "desc" }, { orderNumber: "desc" }],
        },
      },
    });

    if (!customer) {
      throw new AppException(
        AppException.errorCodes.adminCustomers.CUSTOMER_NOT_FOUND,
        "Cliente não encontrado.",
        AppException.HttpStatus.NOT_FOUND,
      );
    }

    return {
      ...customer,
      orders: customer.orders.map((order) => ({
        ...order,
        ...computeOrderTotals(order),
      })),
    };
  }

  private async findAllSortedByDeliveredOrders(
    where: Prisma.CustomerWhereInput,
    page: number,
    limit: number,
    skip: number,
    direction: "asc" | "desc",
  ) {
    // O `orderBy` não é redundante com a ordenação em memória: sem ele o
    // Postgres não garante ordem alguma, e como o `sort` é estável os empates
    // — a maioria das linhas, todas com zero pedidos entregues — seriam
    // fatiados de forma diferente a cada página, duplicando ou omitindo
    // clientes ao longo da paginação. O `id` desempata o `createdAt`, que não
    // é único.
    const allCustomers = await this.prisma.customer.findMany({
      where,
      select: {
        id: true,
        _count: {
          select: {
            orders: { where: { status: "DELIVERED" } },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    allCustomers.sort((a, b) => {
      const diff = a._count.orders - b._count.orders;
      return direction === "asc" ? diff : -diff;
    });

    const total = allCustomers.length;
    const paginatedIds = allCustomers
      .slice(skip, skip + limit)
      .map((c) => c.id);

    if (paginatedIds.length === 0) {
      return {
        items: [],
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    }

    const items = await this.prisma.customer.findMany({
      where: { id: { in: paginatedIds } },
      include: {
        addresses: { where: { isMain: true } },
        orders: true,
      },
    });

    const itemMap = new Map(items.map((item) => [item.id, item]));
    const sortedItems = paginatedIds.map((id) => itemMap.get(id)!);

    return {
      items: sortedItems.map((item) => this.mapCustomerResult(item)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  private mapCustomerResult({
    addresses,
    orders,
    ...item
  }: CustomerWithRelations) {
    const mainAddress = addresses[0];

    const ordersCount = orders.reduce(
      (acc, cur) => {
        acc.allOrdersCount = orders.length;

        if (cur.status === "CANCELLED") {
          acc.cancelledOrdersCount += 1;
        } else if (cur.status === "DELIVERED") {
          acc.deliveredOrdersCount += 1;
        }

        return acc;
      },
      { allOrdersCount: 0, cancelledOrdersCount: 0, deliveredOrdersCount: 0 },
    );

    return { ...item, mainAddress, ...ordersCount };
  }

  private async updateCustomerOrThrow(
    customerId: string,
    data: Prisma.CustomerUpdateInput,
  ) {
    try {
      return await this.prisma.customer.update({
        where: { id: customerId },
        data,
      });
    } catch (error) {
      if (isRecordNotFound(error)) {
        throw new AppException(
          AppException.errorCodes.adminCustomers.CUSTOMER_NOT_FOUND,
          "Cliente não encontrado.",
          AppException.HttpStatus.NOT_FOUND,
        );
      }

      throw error;
    }
  }
}
