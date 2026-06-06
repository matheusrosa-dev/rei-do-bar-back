import { Injectable } from "@nestjs/common";
import { OrderStatus } from "@shared/database/prisma/generated/enums";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import { CancelOrderDto, CreateOrderDto } from "./dtos";
import {
  Cart,
  CartItem,
  Customer,
  Product,
} from "@shared/database/prisma/generated/client";
import { SettingsService } from "@shared/settings/settings.service";

type CustomerWithCartItems = Customer & {
  cart:
    | (Cart & {
        items: Array<CartItem>;
      })
    | null;
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  async getOrders(customerId: string) {
    const orders = await this.findAndFormatOrders(customerId);

    return orders;
  }

  async createOrder(customerId: string, dto: CreateOrderDto) {
    const customer = await this.prisma.customer.findFirst({
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

    this.checkIfCustomerIsAptToCreateOrder(customer);

    const assuredCustomer = {
      ...customer!,
      cart: customer!.cart!,
    };

    this.checkIfThereAreInvalidItemsInCart(assuredCustomer.cart.items);

    const mainAddress = assuredCustomer.addresses.find(
      (address) => address.isMain,
    );

    if (!mainAddress) {
      throw new AppException(
        AppException.errorCodes.order.NO_MAIN_ADDRESS,
        "Nenhum endereço principal cadastrado.",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    const deliveryFee = await this.settingsService.getDeliveryFee();

    await this.prisma.$transaction(async (tx) => {
      // Bloqueia a linha do cliente para serializar criações de pedido
      // concorrentes e garantir a regra de apenas um pedido em andamento
      await tx.$queryRaw`SELECT id FROM customers WHERE id = ${assuredCustomer.id} FOR UPDATE`;

      const ongoingOrdersCount = await tx.order.count({
        where: {
          customerId: assuredCustomer.id,
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

      // Cria o pedido com os itens do carrinho
      await tx.order.create({
        data: {
          customerId: assuredCustomer.id,
          address: `${mainAddress.street}, ${mainAddress.number} - ${mainAddress.neighborhood}/${mainAddress.zipCode}`,
          status: OrderStatus.PENDING,
          deliveryFee: deliveryFee,
          paymentType: dto.paymentType,
          items: {
            createMany: {
              data: assuredCustomer.cart.items.map((item) => ({
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
      for (const item of assuredCustomer.cart.items) {
        const result = await tx.product.updateMany({
          where: { id: item.productId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });

        if (result.count === 0) {
          throw new AppException(
            AppException.errorCodes.order.PRODUCTS_OUT_OF_STOCK,
            `${item.product.name} não tem estoque suficiente para a quantidade solicitada.`,
            AppException.HttpStatus.BAD_REQUEST,
          );
        }
      }

      // Limpa o carrinho do cliente
      await tx.cartItem.deleteMany({
        where: {
          cartId: assuredCustomer.cart.id,
        },
      });
    });

    const orders = await this.getOrders(customerId);

    return orders;
  }

  async cancelOrder(customerId: string, dto: CancelOrderDto) {
    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, customerId },
      include: { items: true },
    });

    if (!order) {
      throw new AppException(
        AppException.errorCodes.order.ORDER_NOT_FOUND,
        "Pedido não encontrado",
        AppException.HttpStatus.NOT_FOUND,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const cancellableStatuses: OrderStatus[] = [
        OrderStatus.PENDING,
        OrderStatus.PREPARING,
      ];

      // Marca o pedido como cancelado
      const result = await tx.order.updateMany({
        where: { id: order.id, status: { in: cancellableStatuses } },
        data: { status: OrderStatus.CANCELLED },
      });

      if (result.count === 0) {
        throw new AppException(
          AppException.errorCodes.order.ORDER_NOT_CANCELLABLE,
          "Este pedido não pode mais ser cancelado.",
          AppException.HttpStatus.BAD_REQUEST,
        );
      }

      // Devolve o estoque dos produtos do pedido
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
    });

    const orders = await this.getOrders(customerId);

    return orders;
  }

  private async findAndFormatOrders(customerId: string) {
    const orders = await this.prisma.order.findMany({
      where: { customerId },
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

  private checkIfCustomerIsAptToCreateOrder(
    customer: CustomerWithCartItems | null,
  ) {
    if (!customer?.name) {
      throw new AppException(
        AppException.errorCodes.order.CUSTOMER_NOT_INITIALIZED,
        "Cliente não inicializado",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    if (!customer?.cart?.items?.length) {
      throw new AppException(
        AppException.errorCodes.order.CART_EMPTY,
        "O carrinho está vazio",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }
  }

  private checkIfThereAreInvalidItemsInCart(
    cartItems: Array<
      CartItem & {
        product: Product;
      }
    >,
  ) {
    const cartItemExceedingStockOrInactive = cartItems.find(
      (item) =>
        item.quantity > item.product.stock ||
        !item.product.isActive ||
        item.product.deletedAt !== null,
    );

    if (cartItemExceedingStockOrInactive) {
      const productName = cartItemExceedingStockOrInactive.product.name;
      const productStock = cartItemExceedingStockOrInactive.product.stock;
      const producIsActive = cartItemExceedingStockOrInactive.product.isActive;
      const productIsDeleted =
        cartItemExceedingStockOrInactive.product.deletedAt !== null;

      if (!producIsActive || productIsDeleted) {
        throw new AppException(
          AppException.errorCodes.order.PRODUCT_INACTIVE,
          `${productName} não está mais disponível. Remova o produto para finalizar o pedido.`,
          AppException.HttpStatus.BAD_REQUEST,
        );
      }

      if (productStock === 0) {
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
          `${productName} tem apenas ${productStock} ${unity} ${remainingText}.`,
          AppException.HttpStatus.BAD_REQUEST,
        );
      }

      throw new AppException(
        AppException.errorCodes.order.PRODUCTS_OUT_OF_STOCK,
        `${productName} não tem estoque suficiente para a quantidade solicitada.`,
        AppException.HttpStatus.BAD_REQUEST,
      );
    }
  }
}
