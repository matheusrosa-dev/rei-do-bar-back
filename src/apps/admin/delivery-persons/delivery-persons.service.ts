import { Injectable } from "@nestjs/common";
import { OrderStatus, Prisma } from "@shared/database/prisma/generated/client";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import { getRecentOrdersWindowStart } from "@shared/helpers/orders-window";
import { hashPassword } from "@shared/helpers/password";
import {
  isForeignKeyConstraintViolation,
  isRecordNotFound,
  isUniqueConstraintViolation,
} from "@shared/helpers/prisma-errors";
import { CreateDeliveryPersonDto } from "./dtos/create-delivery-person.dto";
import { FindAllDeliveryPersonsDto } from "./dtos/find-all-delivery-persons.dto";
import { UpdateDeliveryPersonPasswordBodyDto } from "./dtos/update-delivery-person-password.dto";
import { UpdateDeliveryPersonBodyDto } from "./dtos/update-delivery-person.dto";
import {
  mapDeliveryPerson,
  mapDeliveryPersonListItem,
  mapDeliveryPersonWithCount,
} from "./helpers";

const DELIVERED_ORDERS_COUNT = {
  orders: { where: { status: OrderStatus.DELIVERED } },
} satisfies Prisma.DeliveryPersonCountOutputTypeSelect;

@Injectable()
export class AdminDeliveryPersonsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(dto: FindAllDeliveryPersonsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.DeliveryPersonWhereInput = {
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.searchTerm && {
        OR: [
          { name: { contains: dto.searchTerm, mode: "insensitive" } },
          { phone: { contains: dto.searchTerm, mode: "insensitive" } },
          { cpf: { contains: dto.searchTerm, mode: "insensitive" } },
        ],
      }),
    };

    const now = new Date();

    const [items, total] = await this.prisma.$transaction([
      this.prisma.deliveryPerson.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: {
          _count: { select: DELIVERED_ORDERS_COUNT },
          session: { select: { refreshTokenExpiresAt: true } },
        },
      }),
      this.prisma.deliveryPerson.count({ where }),
    ]);

    const recentDeliveriesByPerson = await this.countRecentDeliveriesByPerson(
      items,
      now,
    );

    return {
      items: items.map((item) =>
        mapDeliveryPersonListItem(
          item,
          now,
          recentDeliveriesByPerson.get(item.id) ?? 0,
        ),
      ),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findAllSimple() {
    const deliveryPersons = await this.prisma.deliveryPerson.findMany({
      where: {
        isActive: true,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });

    return deliveryPersons.map((item) => mapDeliveryPerson(item));
  }

  async hasDeliveryPersonsWithAccess() {
    const now = new Date();

    const deliveryPerson = await this.prisma.deliveryPerson.findFirst({
      where: {
        isActive: true,
        OR: [
          { hashedPassword: { not: null } },
          { session: { refreshTokenExpiresAt: { gt: now } } },
        ],
      },
      select: { id: true },
    });

    return { hasAccess: Boolean(deliveryPerson) };
  }

  async findDeliveryPersonById(deliveryPersonId: string) {
    const deliveryPerson = await this.prisma.deliveryPerson.findUnique({
      where: { id: deliveryPersonId },
      include: {
        _count: { select: DELIVERED_ORDERS_COUNT },
      },
    });

    if (!deliveryPerson) {
      throw new AppException(
        AppException.errorCodes.adminDeliveryPersons.DELIVERY_PERSON_NOT_FOUND,
        "Entregador não encontrado.",
        AppException.HttpStatus.NOT_FOUND,
      );
    }

    return mapDeliveryPersonWithCount(deliveryPerson);
  }

  async createDeliveryPerson(dto: CreateDeliveryPersonDto) {
    try {
      const deliveryPerson = await this.prisma.deliveryPerson.create({
        data: {
          name: dto.name,
          phone: dto.phone,
          cpf: dto.cpf,
          isActive: true,
          addressStreet: dto.address.street,
          addressNumber: dto.address.number,
          addressNeighborhood: dto.address.neighborhood,
          addressZipCode: dto.address.zipCode,
        },
      });

      return mapDeliveryPerson(deliveryPerson);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new AppException(
          AppException.errorCodes.adminDeliveryPersons
            .DELIVERY_PERSON_ALREADY_EXISTS,
          "Já existe um entregador com este CPF ou telefone.",
          AppException.HttpStatus.CONFLICT,
        );
      }

      throw error;
    }
  }

  async updateDeliveryPerson(
    deliveryPersonId: string,
    dto: UpdateDeliveryPersonBodyDto,
  ) {
    try {
      const deliveryPerson = await this.prisma.deliveryPerson.update({
        where: { id: deliveryPersonId },
        data: {
          name: dto.name,
          phone: dto.phone,
          cpf: dto.cpf,
          addressStreet: dto.address.street,
          addressNumber: dto.address.number,
          addressNeighborhood: dto.address.neighborhood,
          addressZipCode: dto.address.zipCode,
        },
      });

      return mapDeliveryPerson(deliveryPerson);
    } catch (error) {
      if (isRecordNotFound(error)) {
        throw new AppException(
          AppException.errorCodes.adminDeliveryPersons
            .DELIVERY_PERSON_NOT_FOUND,
          "Entregador não encontrado.",
          AppException.HttpStatus.NOT_FOUND,
        );
      }

      if (isUniqueConstraintViolation(error)) {
        throw new AppException(
          AppException.errorCodes.adminDeliveryPersons
            .DELIVERY_PERSON_ALREADY_EXISTS,
          "Já existe um entregador com este CPF ou telefone.",
          AppException.HttpStatus.CONFLICT,
        );
      }

      throw error;
    }
  }

  async updateDeliveryPersonPassword(
    deliveryPersonId: string,
    dto: UpdateDeliveryPersonPasswordBodyDto,
  ) {
    const hashedPassword = await hashPassword(dto.password);

    return this.updateDeliveryPersonAndRevokeAccessOrThrow(deliveryPersonId, {
      hashedPassword,
    });
  }

  async activateDeliveryPerson(deliveryPersonId: string) {
    return this.updateDeliveryPersonOrThrow(deliveryPersonId, {
      isActive: true,
      hashedPassword: null,
    });
  }

  async deactivateDeliveryPerson(deliveryPersonId: string) {
    return this.updateDeliveryPersonAndRevokeAccessOrThrow(deliveryPersonId, {
      isActive: false,
      hashedPassword: null,
    });
  }

  async revokeDeliveryPersonAccess(deliveryPersonId: string) {
    await this.updateDeliveryPersonAndRevokeAccessOrThrow(deliveryPersonId, {
      hashedPassword: null,
    });
  }

  async revokeAllDeliveryPersonsAccess() {
    await this.prisma.$transaction([
      this.prisma.deliveryPerson.updateMany({
        data: { hashedPassword: null },
      }),
      this.prisma.deliveryPersonSession.deleteMany(),
    ]);
  }

  async removeDeliveryPerson(deliveryPersonId: string) {
    try {
      await this.prisma.$transaction(async (tx) => {
        // Bloqueia a linha do entregador para serializar contra atribuições
        // concorrentes (transição para SHIPPED) e garantir que a contagem de
        // pedidos vinculados seja consistente com a exclusão.
        const [locked] = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM delivery_persons WHERE id = ${deliveryPersonId} FOR UPDATE`;

        if (!locked) {
          throw new AppException(
            AppException.errorCodes.adminDeliveryPersons
              .DELIVERY_PERSON_NOT_FOUND,
            "Entregador não encontrado.",
            AppException.HttpStatus.NOT_FOUND,
          );
        }

        const ordersCount = await tx.order.count({
          where: { deliveryPersonId },
        });

        if (ordersCount > 0) {
          throw new AppException(
            AppException.errorCodes.adminDeliveryPersons
              .DELIVERY_PERSON_HAS_ORDERS,
            "Não é possível excluir um entregador com pedidos vinculados.",
            AppException.HttpStatus.CONFLICT,
          );
        }

        await tx.deliveryPerson.delete({ where: { id: deliveryPersonId } });
      });
    } catch (error) {
      if (isForeignKeyConstraintViolation(error)) {
        throw new AppException(
          AppException.errorCodes.adminDeliveryPersons
            .DELIVERY_PERSON_HAS_ORDERS,
          "Não é possível excluir um entregador com pedidos vinculados.",
          AppException.HttpStatus.CONFLICT,
        );
      }

      throw error;
    }
  }

  private async countRecentDeliveriesByPerson(
    deliveryPersons: { id: string }[],
    now: Date,
  ) {
    if (deliveryPersons.length === 0) {
      return new Map<string | null, number>();
    }

    const windowStart = getRecentOrdersWindowStart(now);

    const recentDeliveries = await this.prisma.order.groupBy({
      by: ["deliveryPersonId"],
      where: {
        deliveryPersonId: { in: deliveryPersons.map(({ id }) => id) },
        status: OrderStatus.DELIVERED,
        deliveredAt: { gte: windowStart },
      },
      _count: { _all: true },
    });

    return new Map(
      recentDeliveries.map((group) => [
        group.deliveryPersonId,
        group._count._all,
      ]),
    );
  }

  private async updateDeliveryPersonOrThrow(
    deliveryPersonId: string,
    data: Prisma.DeliveryPersonUpdateInput,
  ) {
    try {
      const deliveryPerson = await this.prisma.deliveryPerson.update({
        where: { id: deliveryPersonId },
        data,
      });

      return mapDeliveryPerson(deliveryPerson);
    } catch (error) {
      if (isRecordNotFound(error)) {
        throw this.deliveryPersonNotFound();
      }

      throw error;
    }
  }

  private async updateDeliveryPersonAndRevokeAccessOrThrow(
    deliveryPersonId: string,
    data: Prisma.DeliveryPersonUpdateInput,
  ) {
    try {
      const [deliveryPerson] = await this.prisma.$transaction([
        this.prisma.deliveryPerson.update({
          where: { id: deliveryPersonId },
          data,
        }),
        this.prisma.deliveryPersonSession.deleteMany({
          where: { deliveryPersonId },
        }),
      ]);

      return mapDeliveryPerson(deliveryPerson);
    } catch (error) {
      if (isRecordNotFound(error)) {
        throw this.deliveryPersonNotFound();
      }

      throw error;
    }
  }

  private deliveryPersonNotFound() {
    return new AppException(
      AppException.errorCodes.adminDeliveryPersons.DELIVERY_PERSON_NOT_FOUND,
      "Entregador não encontrado.",
      AppException.HttpStatus.NOT_FOUND,
    );
  }
}
