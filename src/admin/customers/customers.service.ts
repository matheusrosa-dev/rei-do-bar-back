import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import { Prisma } from "@shared/database/prisma/generated/client";
import { FindAllCustomersDto } from "./dtos";
import { CustomerWithRelations } from "./helpers";

@Injectable()
export class AdminCustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async removeCustomer(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { _count: { select: { orders: true } } },
    });

    if (!customer) {
      throw new AppException(
        AppException.errorCodes.adminCustomers.CUSTOMER_NOT_FOUND,
        "Cliente não encontrado.",
        AppException.HttpStatus.NOT_FOUND,
      );
    }

    if (customer._count.orders > 0) {
      throw new AppException(
        AppException.errorCodes.adminCustomers.CUSTOMER_HAS_ORDERS,
        "Não é possível excluir um cliente que possui pedidos.",
        AppException.HttpStatus.CONFLICT,
      );
    }

    await this.prisma.customer.delete({ where: { id: customerId } });
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

    const orderBy: Prisma.CustomerOrderByWithRelationInput =
      dto.sortKey === "allOrdersCount"
        ? { orders: { _count: direction } }
        : { createdAt: "desc" };

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
          orderBy: {
            createdAt: "desc",
          },
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

    return customer;
  }

  private async findAllSortedByDeliveredOrders(
    where: Prisma.CustomerWhereInput,
    page: number,
    limit: number,
    skip: number,
    direction: "asc" | "desc",
  ) {
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
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
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
