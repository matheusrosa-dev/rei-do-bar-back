import { Injectable } from "@nestjs/common";
import { OrderStatus, Prisma } from "@shared/database/prisma/generated/client";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
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

@Injectable()
export class AdminDeliveryPersonsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(dto: FindAllDeliveryPersonsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    const direction = dto.sortDirection ?? "desc";

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

    const orderBy = this.buildOrderBy(dto.sortKey, direction);
    const now = new Date();

    const [items, total] = await this.prisma.$transaction([
      this.prisma.deliveryPerson.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          _count: {
            select: {
              orders: {
                where: {
                  status: OrderStatus.DELIVERED,
                },
              },
            },
          },
          session: { select: { refreshTokenExpiresAt: true } },
        },
      }),
      this.prisma.deliveryPerson.count({ where }),
    ]);

    return {
      items: items.map((item) => mapDeliveryPersonListItem(item, now)),
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
      orderBy: {
        name: "asc",
      },
    });

    return deliveryPersons.map((item) => mapDeliveryPerson(item));
  }

  async findDeliveryPersonById(deliveryPersonId: string) {
    const deliveryPerson = await this.prisma.deliveryPerson.findUnique({
      where: { id: deliveryPersonId },
      include: {
        _count: { select: { orders: true } },
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
    });
  }

  async deactivateDeliveryPerson(deliveryPersonId: string) {
    return this.updateDeliveryPersonAndRevokeAccessOrThrow(deliveryPersonId, {
      isActive: false,
    });
  }

  async revokeDeliveryPersonAccess(deliveryPersonId: string) {
    const deliveryPerson = await this.prisma.deliveryPerson.findUnique({
      where: { id: deliveryPersonId },
      select: { id: true },
    });

    if (!deliveryPerson) {
      throw this.deliveryPersonNotFound();
    }

    await this.prisma.deliveryPersonSession.deleteMany({
      where: { deliveryPersonId },
    });
  }

  async revokeAllDeliveryPersonsAccess() {
    await this.prisma.deliveryPersonSession.deleteMany();
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

  private buildOrderBy(
    sortKey: "createdAt" | "ordersCount" | undefined,
    direction: "asc" | "desc",
  ): Prisma.DeliveryPersonOrderByWithRelationInput {
    if (sortKey === "ordersCount") {
      return { orders: { _count: direction } };
    }

    if (sortKey) {
      return { [sortKey]: direction };
    }

    return { createdAt: "desc" };
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
