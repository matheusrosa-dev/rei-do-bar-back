import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { randomUUID } from "node:crypto";
import { SyncDeviceIdDto } from "./dtos";
import { AppException } from "@shared/exceptions/app.exception";

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async syncDeviceId(dto: SyncDeviceIdDto) {
    let deviceId = dto?.deviceId;

    if (!deviceId) {
      deviceId = randomUUID();
    }

    const existingCustomer = await this.prisma.customer.findFirst({
      where: {
        deviceId,
      },
    });

    if (!existingCustomer) {
      await this.initCustomerWithDeviceId(deviceId);
    }

    // TODO: adicionar tratativa no front
    if (existingCustomer && !existingCustomer.isActive) {
      throw new AppException(
        AppException.errorCodes.auth.INACTIVE_CUSTOMER,
        "Seu dispositivo está associado a um cliente inativo. Por favor, entre em contato com o suporte.",
        AppException.HttpStatus.FORBIDDEN,
      );
    }

    return {
      deviceId,
    };
  }

  private async initCustomerWithDeviceId(deviceId: string) {
    const customer = await this.prisma.customer.create({
      data: {
        deviceId,
        isActive: true,
      },
    });

    await this.prisma.cart.create({
      data: {
        customerId: customer.id,
      },
    });
  }
}
