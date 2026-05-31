import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import {
  AddAddressDto,
  InitMeDto,
  RemoveAddressDto,
  SetMainAddressDto,
  UpdateAddressDto,
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
        "Endereço já cadastrado.",
        AppException.HttpStatus.CONFLICT,
      );
    }

    if (me?.addresses.length === 3) {
      throw new AppException(
        AppException.errorCodes.me.LIMITED_NUMBER_OF_ADDRESSES,
        "Limite de endereços atingido.",
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

  async setMainAddress(customerId: string, dto: SetMainAddressDto) {
    const me = await this.findMeOrThrow(customerId, { withAddress: true });

    const address = me.addresses?.find((a) => a.id === dto.addressId);

    if (!address) {
      throw new AppException(
        AppException.errorCodes.me.ADDRESS_NOT_FOUND,
        "Endereço não encontrado",
        AppException.HttpStatus.NOT_FOUND,
      );
    }

    if (address.isMain) {
      throw new AppException(
        AppException.errorCodes.me.ADDRESS_ALREADY_MAIN,
        "Endereço já é o principal",
        AppException.HttpStatus.CONFLICT,
      );
    }

    const customer = await this.prisma.$transaction(async (tx) => {
      await tx.address.updateMany({
        where: { customerId, isMain: true },
        data: { isMain: false },
      });

      return tx.customer.update({
        where: { id: customerId },
        data: {
          addresses: {
            update: {
              where: { id: dto.addressId },
              data: { isMain: true },
            },
          },
        },
        include: { addresses: true },
      });
    });

    return { addresses: this.sortAddresses(customer.addresses) };
  }

  async updateAddress(
    customerId: string,
    addressId: string,
    dto: UpdateAddressDto,
  ) {
    const me = await this.findMeOrThrow(customerId, { withAddress: true });

    const address = me.addresses?.find((a) => a.id === addressId);

    if (!address) {
      throw new AppException(
        AppException.errorCodes.me.ADDRESS_NOT_FOUND,
        "Endereço não encontrado",
        AppException.HttpStatus.NOT_FOUND,
      );
    }

    const duplicate = me.addresses?.find(
      (a) =>
        a.id !== addressId &&
        a.zipCode === dto.zipCode &&
        a.number === dto.number,
    );

    if (duplicate) {
      throw new AppException(
        AppException.errorCodes.me.ADDRESS_ALREADY_EXISTS,
        "Endereço já cadastrado.",
        AppException.HttpStatus.CONFLICT,
      );
    }

    const customer = await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        addresses: {
          update: {
            where: { id: addressId },
            data: {
              zipCode: dto.zipCode,
              neighborhood: dto.neighborhood,
              number: dto.number,
              street: dto.street,
              complement: dto.complement ?? null,
            },
          },
        },
      },
      include: { addresses: true },
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

    if (!me?.addresses || !addressToRemove) {
      throw new AppException(
        AppException.errorCodes.me.ADDRESS_NOT_FOUND,
        "Endereço não encontrado",
        AppException.HttpStatus.NOT_FOUND,
      );
    }

    if (me.addresses.length === 1) {
      throw new AppException(
        AppException.errorCodes.me.CANNOT_REMOVE_MAIN_ADDRESS,
        "Não é possível remover o único endereço cadastrado.",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    const nextAddress = me.addresses.find(
      (address) => address.id !== addressToRemove.id,
    )!;

    const customer = await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        addresses: {
          delete: {
            id: dto.addressId,
          },
          // Promove o próximo endereço para principal se o removido era o principal
          ...(addressToRemove.isMain && {
            update: {
              where: {
                id: nextAddress.id,
              },
              data: {
                isMain: true,
              },
            },
          }),
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
