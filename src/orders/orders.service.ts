import { Injectable } from "@nestjs/common";
import { OrderStatus } from "@shared/database/prisma/generated/enums";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import { CreateOrderDto } from "./dtos";

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrder(customerId: string, dto: CreateOrderDto) {
    const customer = await this.findCustomerOrThrow(customerId);

    if (!customer?.cart?.items?.length) {
      throw new AppException(
        AppException.errorCodes.order.CART_EMPTY,
        "O carrinho está vazio",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    const ongoingOrdersCount = await this.prisma.order.count({
      where: {
        customerId: customer.id,
        status: {
          notIn: [OrderStatus.CANCELLED, OrderStatus.DELIVERED],
        },
      },
    });

    if (ongoingOrdersCount) {
      throw new AppException(
        AppException.errorCodes.order.ONGOING_ORDER,
        "Você já tem um pedido em andamento.",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    const cartItemExceedingStockOrInactive = customer.cart.items.find(
      (item) => item.quantity > item.product.stock || !item.product.isActive,
    );

    if (cartItemExceedingStockOrInactive) {
      const productName = cartItemExceedingStockOrInactive.product.name;
      const productStock = cartItemExceedingStockOrInactive.product.stock;
      const producIsActive = cartItemExceedingStockOrInactive.product.isActive;

      if (productStock === 0 || !producIsActive) {
        throw new AppException(
          AppException.errorCodes.order.PRODUCTS_OUT_OF_STOCK,
          `${productName} está sem estoque no momento. Remova o produto para finalizar o pedido.`,
          AppException.HttpStatus.BAD_REQUEST,
        );
      }

      if (productStock <= 10) {
        const unity = productStock > 1 ? "unidades" : "unidade";
        const remainingText = productStock > 1 ? "restantes" : "restante";

        throw new AppException(
          AppException.errorCodes.order.PRODUCTS_OUT_OF_STOCK,
          `${productName} tem apenas ${productStock} ${unity} ${remainingText}. Reduza a quantidade para finalizar o pedido.`,
          AppException.HttpStatus.BAD_REQUEST,
        );
      }

      throw new AppException(
        AppException.errorCodes.order.PRODUCTS_OUT_OF_STOCK,
        `${productName} não tem estoque suficiente para a quantidade solicitada. Reduza a quantidade para finalizar o pedido.`,
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    const mainAddress = customer.addresses.find((address) => address.isMain);
    const deliveryFeeSetting = await this.prisma.setting.findUnique({
      where: { key: "DELIVERY_FEE" },
    });

    await this.prisma.$transaction(async (tx) => {
      const cart = customer.cart!;

      // Cria o pedido com os itens do carrinho
      await tx.order.create({
        data: {
          customerId: customer.id,
          address: `${mainAddress?.street}, ${mainAddress?.number} - ${mainAddress?.neighborhood}/${mainAddress?.zipCode}`,
          status: OrderStatus.PENDING,
          deliveryFee: Number(deliveryFeeSetting?.value),
          paymentType: dto.paymentType,
          items: {
            createMany: {
              data: cart.items.map((item) => ({
                name: item.product.name,
                price: item.product.price,
                quantity: item.quantity,
                imageUrl: item.product.imageUrl,
                productId: item.productId,
              })),
            },
          },
        },
      });

      // Decrementa o estoque dos produtos do carrinho
      await Promise.all(
        cart.items.map((item) =>
          tx.product.update({
            where: { id: item.productId },
            data: {
              stock: { decrement: item.quantity },
            },
          }),
        ),
      );

      // Limpa o carrinho do cliente
      await tx.cartItem.deleteMany({
        where: {
          cartId: cart.id,
        },
      });
    });
  }

  async getOrders(customerId: string) {
    const customer = await this.findCustomerOrThrow(customerId);

    // TODO: não deve ser possível fazer um pedido se já existe um pedido em andamento

    const orders = await this.prisma.order.findMany({
      where: { customerId: customer.id },
      include: {
        items: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const formattedOrders = orders.map((order) => {
      const subtotal = order.items.reduce((sum, item) => {
        return sum + item.price * item.quantity;
      }, 0);

      const total = subtotal + order.deliveryFee;

      return {
        ...order,
        subtotal,
        total,
      };
    });

    return formattedOrders;
  }

  private async findCustomerOrThrow(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId, isActive: true },
      include: {
        addresses: true,
        cart: {
          include: {
            items: {
              include: {
                product: true,
              },
            },
          },
        },
      },
    });

    if (!customer) {
      throw new AppException(
        AppException.errorCodes.order.CUSTOMER_NOT_FOUND,
        "Cliente não encontrado",
        AppException.HttpStatus.NOT_FOUND,
      );
    }

    if (!customer?.name || !customer?.addresses?.length) {
      throw new AppException(
        AppException.errorCodes.order.CUSTOMER_NOT_INITIALIZED,
        "Cliente não inicializado",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    return customer;
  }
}
