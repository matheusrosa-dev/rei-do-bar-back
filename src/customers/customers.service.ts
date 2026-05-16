import { Injectable } from "@nestjs/common";
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

      await Promise.all([
        // Atribui o carrinho anônimo ao novo cliente
        tx.cart.update({
          where: {
            id: data.anonymousCustomer.cartId,
          },
          data: {
            anonymousCustomerId: null,
            customerId: newCustomer.id,
          },
        }),

        // Remove o cliente anônimo, já que não é mais necessário
        tx.anonymousCustomer.delete({
          where: {
            id: data.anonymousCustomer.id,
          },
        }),
      ]);

      return newCustomer;
    });

    return newCustomer;
  }
}
