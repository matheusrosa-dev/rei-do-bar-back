import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO: ADICIONAR TESTES EM TUDO AQUI

  async createOrder(customerId: string) {
    const customer = await this.findCustomerOrThrow(customerId);

    if (!customer?.name) {
      throw new AppException(
        AppException.errorCodes.order.CUSTOMER_NOT_INITIALIZED,
        "Cliente não inicializado",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    console.log("fez o pedido");
  }

  private findCustomerOrThrow(customerId: string) {
    const customer = this.prisma.customer.findUnique({
      where: { id: customerId, isActive: true },
    });

    if (!customer) {
      throw new AppException(
        AppException.errorCodes.order.CUSTOMER_NOT_FOUND,
        "Cliente não encontrado",
        AppException.HttpStatus.NOT_FOUND,
      );
    }

    return customer;
  }
}
