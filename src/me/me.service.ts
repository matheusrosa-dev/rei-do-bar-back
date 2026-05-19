import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AddAddressDto, RemoveAddressDto, UpdateMeDto } from "./dtos";
import { AppException } from "@shared/exceptions/app.exception";
import { Address } from "@shared/database/prisma/generated/client";

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  async findMe(customerId: string) {
    return this.findMeOrThrow(customerId, {
      withAddress: true,
    });
  }

  async updateMe(customerId: string, dto: UpdateMeDto) {
    if (!Object.keys(dto).length) {
      throw new AppException(
        AppException.errorCodes.me.NO_FIELDS_TO_UPDATE,
        "Nenhum campo para atualizar",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    await this.findMeOrThrow(customerId);

    const updatedMe = await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(dto?.name && { name: dto.name }),
      },
    });

    return updatedMe;
  }

  async addAddress(customerId: string, dto: AddAddressDto) {
    const me = await this.findMeOrThrow(customerId, {
      withAddress: true,
    });

    const existingAddress = me.addresses?.find(
      (address) =>
        address.zipCode === dto.zipCode && address.number === dto.number,
    );

    // TODO: limitar 3 endereços por cliente

    if (existingAddress) {
      throw new AppException(
        AppException.errorCodes.me.ADDRESS_ALREADY_EXISTS,
        "Endereço já cadastrado. Remova o endereço existente para cadastrar um novo com os mesmos dados.",
        AppException.HttpStatus.CONFLICT,
      );
    }

    const customer = await this.prisma.$transaction(async (tx) => {
      await tx.address.updateMany({
        where: {
          customerId,
          isMain: true,
        },
        data: {
          isMain: false,
        },
      });

      const result = await tx.customer.update({
        where: { id: customerId },
        data: {
          addresses: {
            create: {
              zipCode: dto.zipCode,
              neighborhood: dto.neighborhood,
              number: dto.number,
              street: dto.street,
              complement: dto.complement,
              isMain: true,
            },
          },
        },
        include: {
          addresses: true,
        },
      });

      return result;
    });

    return { addresses: customer.addresses };
  }

  async removeAddress(customerId: string, dto: RemoveAddressDto) {
    const me = await this.findMeOrThrow(customerId, {
      withAddress: true,
    });

    const addressToRemove = me.addresses?.find(
      (address) => address.id === dto.addressId,
    );

    if (!addressToRemove) {
      throw new AppException(
        AppException.errorCodes.me.ADDRESS_NOT_FOUND,
        "Endereço não encontrado",
        AppException.HttpStatus.NOT_FOUND,
      );
    }

    const customer = await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        addresses: {
          delete: {
            id: dto.addressId,
          },
        },
      },
      include: {
        addresses: true,
      },
    });

    return { addresses: customer.addresses };
  }

  private async findMeOrThrow(
    customerId: string,
    options?: { withAddress?: boolean },
  ) {
    const me = await this.prisma.customer.findUnique({
      where: {
        id: customerId,
        isActive: true,
      },
      include: {
        addresses: !!options?.withAddress,
      },
    });

    if (!me) {
      throw new AppException(
        AppException.errorCodes.me.CUSTOMER_NOT_FOUND,
        "Cliente não encontrado",
        AppException.HttpStatus.NOT_FOUND,
      );
    }

    if (options?.withAddress) {
      me.addresses = this.sortAddresses(me.addresses);
    }

    return me;
  }

  // TODO: adicionar testes aqui e tambem nos metodos que usam
  sortAddresses(addresses: Address[]) {
    return addresses.sort((a, b) => Number(b.isMain) - Number(a.isMain));
  }
}
