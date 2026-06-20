import { Injectable } from "@nestjs/common";
import { Prisma } from "@shared/database/prisma/generated/client";
import { PrismaService } from "@shared/database/prisma/prisma.service";

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async createCustomerFromAnonymous(data: {
    newCustomer: {
      phone: string;
    };
    anonymousCustomer: {
      cartId: string;
      id: string;
    };
  }) {
    const newCustomer = await this.prisma.$transaction(async (tx) => {
      // Cria um novo cliente ativo com o número de telefone fornecido
      const newCustomer = await tx.customer.create({
        data: {
          phone: data.newCustomer.phone,
          isActive: true,
        },
      });

      await this.attachAnonymousCartToCustomer(tx, {
        customerId: newCustomer.id,
        anonymousCustomer: data.anonymousCustomer,
      });

      return newCustomer;
    });

    return newCustomer;
  }

  async replaceCustomerCartWithAnonymous(data: {
    customerId: string;
    anonymousCustomer: {
      id: string;
      cartId: string;
    };
  }) {
    await this.prisma.$transaction(async (tx) => {
      // Descarta o carrinho atual do cliente (e seus itens em cascata) para que
      // o carrinho anônimo o substitua por completo.
      await tx.cart.deleteMany({
        where: { customerId: data.customerId },
      });

      await this.attachAnonymousCartToCustomer(tx, {
        customerId: data.customerId,
        anonymousCustomer: data.anonymousCustomer,
      });
    });
  }

  private async attachAnonymousCartToCustomer(
    tx: Prisma.TransactionClient,
    data: {
      customerId: string;
      anonymousCustomer: { id: string; cartId: string };
    },
  ) {
    // Atribui o carrinho anônimo ao cliente
    await tx.cart.update({
      where: { id: data.anonymousCustomer.cartId },
      data: {
        anonymousCustomerId: null,
        customerId: data.customerId,
      },
    });

    // Remove o cliente anônimo, já que não é mais necessário
    await tx.anonymousCustomer.delete({
      where: { id: data.anonymousCustomer.id },
    });
  }
}
