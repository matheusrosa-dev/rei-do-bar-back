import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import {
  AddAddressDto,
  InitMeDto,
  RemoveAddressDto,
  UpdateMeDto,
} from "./dtos";
import { AppException } from "@shared/exceptions/app.exception";
import { Address } from "@shared/database/prisma/generated/client";

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  async findMe(customerId: string) {
    const me = await this.findMeOrThrow(customerId, {
      withAddress: true,
    });

    return { ...me, addresses: this.sortAddresses(me.addresses) };
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
      include: {
        addresses: true,
      },
    });

    return { ...updatedMe, addresses: this.sortAddresses(updatedMe.addresses) };
  }

  async addAddress(customerId: string, dto: AddAddressDto) {
    const me = await this.findMeOrThrow(customerId, {
      withAddress: true,
    });

    const existingAddress = me.addresses?.find(
      (address) =>
        address.zipCode === dto.zipCode && address.number === dto.number,
    );

    if (existingAddress) {
      throw new AppException(
        AppException.errorCodes.me.ADDRESS_ALREADY_EXISTS,
        "Endereço já cadastrado. Remova o endereço existente para cadastrar um novo com os mesmos dados.",
        AppException.HttpStatus.CONFLICT,
      );
    }

    if (me?.addresses.length === 3) {
      throw new AppException(
        AppException.errorCodes.me.LIMITED_NUMBER_OF_ADDRESSES,
        "Limite de endereços atingido. Remova um endereço existente para cadastrar um novo.",
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

    return { addresses: this.sortAddresses(customer.addresses) };
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

    if (addressToRemove.isMain) {
      throw new AppException(
        AppException.errorCodes.me.CANNOT_REMOVE_MAIN_ADDRESS,
        "Não é permitido remover o endereço principal. Defina outro endereço como principal antes de remover este.",
        AppException.HttpStatus.BAD_REQUEST,
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

    return { addresses: this.sortAddresses(customer.addresses) };
  }

  async initMe(customerId: string, dto: InitMeDto) {
    const me = await this.findMeOrThrow(customerId);

    if (me.name) {
      throw new AppException(
        AppException.errorCodes.me.ALREADY_INITIALIZED,
        "Dados do cliente já inicializados",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    const updatedMe = await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        name: dto.name,
        addresses: {
          create: {
            zipCode: dto.address.zipCode,
            neighborhood: dto.address.neighborhood,
            number: dto.address.number,
            street: dto.address.street,
            complement: dto.address.complement,
            isMain: true,
          },
        },
      },
      include: {
        addresses: true,
      },
    });

    return {
      ...updatedMe,
      addresses: this.sortAddresses(updatedMe.addresses),
    };
  }

  async deleteMe(customerId: string) {
    await this.findMeOrThrow(customerId);

    await this.prisma.customer.delete({
      where: { id: customerId },
    });
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

    return me;
  }

  private sortAddresses(addresses: Address[]) {
    return addresses.sort((a, b) => Number(b.isMain) - Number(a.isMain));
  }
}
