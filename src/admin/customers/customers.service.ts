import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import { Prisma } from "@shared/database/prisma/generated/client";
import { FindAllCustomersDto } from "./dtos";

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

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

    const where: Prisma.CustomerWhereInput = {
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          addresses: {
            where: {
              isMain: true,
            },
          },
          orders: true,
        },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      items: items.map(({ addresses, orders, ...item }) => {
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
          {
            allOrdersCount: 0,
            cancelledOrdersCount: 0,
            deliveredOrdersCount: 0,
          },
        );

        return {
          ...item,
          mainAddress,
          ...ordersCount,
        };
      }),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async updateCustomerOrThrow(
    customerId: string,
    data: Prisma.CustomerUpdateInput,
  ) {
    try {
      return await this.prisma.customer.update({
        where: { id: customerId },
        data,
        include: {
          addresses: true,
        },
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
