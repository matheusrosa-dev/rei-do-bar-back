import { Injectable } from "@nestjs/common";
import { PrismaService } from "../shared/database/prisma/prisma.service";
import { randomUUID } from "node:crypto";
import { SyncDeviceIdDto } from "./dtos";

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

    // TODO: tratar se o customer existir mas estiver inativo (isActive: false)

    if (!existingCustomer) {
      await this.initCustomerWithDeviceId(deviceId);
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
