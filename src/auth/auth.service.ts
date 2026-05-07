import { Injectable } from "@nestjs/common";
import { PrismaService } from "../shared/database/prisma/prisma.service";
import { randomUUID } from "node:crypto";
import { SyncDeviceIdDto } from "./dtos";

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async syncDeviceId(dto: SyncDeviceIdDto) {
    let deviceId = dto?.deviceId;

    let isNewDevice = false;

    if (!deviceId) {
      deviceId = randomUUID();
      isNewDevice = true;
    }

    const existingCustomer = await this.prisma.customer.findFirst({
      where: {
        deviceId,
      },
    });

    if (!existingCustomer) {
      await this.prisma.customer.create({
        data: {
          deviceId,
          isActive: true,
        },
      });
    }

    return {
      isNewDevice,
      deviceId,
    };
  }
}
