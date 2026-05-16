import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { UpdateMeDto } from "./dtos";
import { AppException } from "@shared/exceptions/app.exception";

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  async findMe(customerId: string) {
    return this.findMeOrThrow(customerId);
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

    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(dto?.name && { name: dto.name }),
      },
    });
  }

  private async findMeOrThrow(customerId: string) {
    const me = await this.prisma.customer.findUnique({
      where: {
        id: customerId,
        isActive: true,
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
}
