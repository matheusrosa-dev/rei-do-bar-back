import { Injectable } from "@nestjs/common";
import {
  InventoryMovementOrigin,
  OrderStatus,
} from "@shared/database/prisma/generated/enums";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import { CancelOrderDto, CreateOrderDto } from "./dtos";
import {
  Cart,
  CartItem,
  Coupon,
  Customer,
  Order,
  OrderItem,
  Product,
  SettingKey,
} from "@shared/database/prisma/generated/client";
import { SettingsService } from "../settings/settings.service";
import {
  CouponsService,
  WELCOME_COUPON_CODE,
} from "../coupons/coupons.service";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { OrderCreatedEvent, OrderCancelledEvent } from "@shared/events/order";
import { isUniqueConstraintViolation } from "@shared/helpers/prisma-errors";
import {
  computeOrderTotals,
  computeProductsTotals,
} from "@shared/helpers/products-totals";

type CustomerWithCartItems = Customer & {
  cart:
    | (Cart & {
        items: Array<CartItem>;
        coupon: Coupon | null;
      })
    | null;
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly couponsService: CouponsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getOrders(customerId: string) {
    const orders = await this.findAndFormatOrders(customerId);

    return orders;
  }

  async createOrder(customerId: string, dto: CreateOrderDto) {
    const settings = await this.settingsService.findAll();
    const deliveryFee = Number(settings?.DELIVERY_FEE || 0);

    if (settings?.ON_BREAK) {
      throw new AppException(
        AppException.errorCodes.order.ON_BREAK,
        settings.ON_BREAK,
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    if (settings?.OUTSIDE_BUSINESS_HOURS) {
      throw new AppException(
        AppException.errorCodes.order.OUTSIDE_BUSINESS_HOURS,
        settings.OUTSIDE_BUSINESS_HOURS,
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId },
      include: {
        addresses: true,
        cart: {
          include: {
            items: {
              include: {
                product: true,
              },
            },
            coupon: true,
          },
        },
      },
    });

    this.assertCustomerIsAptToCreateOrder(customer);

    const assuredCustomer = {
      ...customer!,
      cart: customer!.cart!,
    };

    this.assertThereAreInvalidItemsInCart(assuredCustomer.cart.items);

    const coupon = assuredCustomer.cart.coupon;

    const { productsTotalLessDiscount } = computeProductsTotals(
      assuredCustomer.cart.items.map(({ product, quantity }) => ({
        price: product.price,
        compareAtPrice: product.compareAtPrice,
        quantity,
      })),
    );

    if (coupon) {
      await this.assertCouponIsRedeemable(
        coupon,
        productsTotalLessDiscount,
        customerId,
      );
    }

    let isWelcomeCoupon = false;
    let welcomeDiscount = 0;

    if (!coupon && SettingKey.WELCOME_COUPON in settings) {
      isWelcomeCoupon =
        await this.couponsService.isCustomerEligibleForWelcomeCoupon(
          customerId,
        );

      if (isWelcomeCoupon) {
        welcomeDiscount = await this.couponsService.calculateWelcomeDiscount(
          productsTotalLessDiscount,
          settings,
        );
      }
    }

    const couponDiscount = coupon
      ? this.couponsService.calculateDiscount(coupon, productsTotalLessDiscount)
      : welcomeDiscount;

    this.assertOrderMeetsMinValue(
      productsTotalLessDiscount,
      couponDiscount,
      settings,
    );

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

    let order: Order & {
      items: OrderItem[];
    };

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

      // Fecha a janela de corrida entre a checagem de elegibilidade fora
      // da transação e a criação do pedido
      if (isWelcomeCoupon) {
        const nonCancelledOrdersCount = await tx.order.count({
          where: {
            customerId: assuredCustomer.id,
            status: { not: OrderStatus.CANCELLED },
          },
        });

        if (nonCancelledOrdersCount > 0) {
          throw new AppException(
            AppException.errorCodes.order.WELCOME_COUPON_UNAVAILABLE,
            "Cupom de boas-vindas indisponível",
            AppException.HttpStatus.BAD_REQUEST,
          );
        }
      }

      // Cria o pedido com os itens do carrinho
      order = await tx.order.create({
        data: {
          customerId: assuredCustomer.id,
          address: `${mainAddress.street}, ${mainAddress.number} - ${mainAddress.neighborhood}/${mainAddress.zipCode}`,
          status: OrderStatus.PENDING,
          deliveryFee,
          couponId: coupon?.id ?? null,
          couponCode:
            coupon?.code ?? (isWelcomeCoupon ? WELCOME_COUPON_CODE : null),
          couponDiscount,
          paymentType: dto.paymentType,
          items: {
            createMany: {
              data: assuredCustomer.cart.items.map((item) => ({
                name: item.product.name,
                price: item.product.price,
                compareAtPrice: item.product.compareAtPrice,
                quantity: item.quantity,
                imageUrl: item.product.imageUrl,
                productId: item.productId,
              })),
            },
          },
        },
        include: {
          items: true,
        },
      });

      // Decrementa o estoque dos produtos do carrinho
      for (const item of assuredCustomer.cart.items) {
        const result = await tx.product.updateMany({
          where: { id: item.productId, stockQuantity: { gte: item.quantity } },
          data: { stockQuantity: { decrement: item.quantity } },
        });

        if (result.count === 0) {
          throw new AppException(
            AppException.errorCodes.order.PRODUCTS_OUT_OF_STOCK,
            `${item.product.name} não tem estoque suficiente para a quantidade solicitada.`,
            AppException.HttpStatus.BAD_REQUEST,
          );
        }
      }

      // Registra o uso do cupom; a constraint única (couponId, customerId)
      // garante um único uso por cliente mesmo em requisições concorrentes
      if (coupon) {
        if (coupon.usageLimit) {
          // Bloqueia a linha do cupom para serializar usos concorrentes
          // de clientes diferentes e não estourar o limite global
          await tx.$queryRaw`SELECT id FROM coupons WHERE id = ${coupon.id} FOR UPDATE`;

          const usageCount = await tx.couponUsage.count({
            where: { couponId: coupon.id },
          });

          if (usageCount >= coupon.usageLimit) {
            throw new AppException(
              AppException.errorCodes.order.COUPON_USAGE_LIMIT_REACHED,
              "Este cupom atingiu o limite de uso",
              AppException.HttpStatus.BAD_REQUEST,
            );
          }
        }

        try {
          await tx.couponUsage.create({
            data: {
              couponId: coupon.id,
              customerId: assuredCustomer.id,
            },
          });
        } catch (error) {
          if (isUniqueConstraintViolation(error)) {
            throw new AppException(
              AppException.errorCodes.order.COUPON_ALREADY_USED,
              "Você já utilizou este cupom",
              AppException.HttpStatus.BAD_REQUEST,
            );
          }

          throw error;
        }
      }

      // Limpa o carrinho do cliente e desvincula o cupom consumido
      await tx.cart.update({
        where: { id: assuredCustomer.cart.id },
        data: {
          couponId: null,
          items: {
            deleteMany: {},
          },
        },
      });
    });

    this.eventEmitter.emit(
      OrderCreatedEvent.NAME,
      new OrderCreatedEvent({
        order: order!,
      }),
    );

    const orders = await this.findAndFormatOrders(customerId);

    return orders;
  }

  async cancelOrder(customerId: string, dto: CancelOrderDto) {
    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, customerId },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!order) {
      throw new AppException(
        AppException.errorCodes.order.ORDER_NOT_FOUND,
        "Pedido não encontrado",
        AppException.HttpStatus.NOT_FOUND,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Marca o pedido como cancelado
      const result = await tx.order.updateMany({
        where: { id: order.id, status: OrderStatus.PENDING },
        data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
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
          data: { stockQuantity: { increment: item.quantity } },
        });
      }

      // Reverte o uso do cupom aplicado ao pedido
      if (order.couponId) {
        await tx.couponUsage.deleteMany({
          where: { couponId: order.couponId, customerId },
        });
      }
    });

    this.eventEmitter.emit(
      OrderCancelledEvent.NAME,
      new OrderCancelledEvent({
        origin: InventoryMovementOrigin.ORDER_CANCELLATION,
        order,
      }),
    );

    const orders = await this.findAndFormatOrders(customerId);

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

    const formattedOrders = orders.map((order) => ({
      ...order,
      ...computeOrderTotals(order),
    }));

    return formattedOrders;
  }

  private assertCustomerIsAptToCreateOrder(
    customer: CustomerWithCartItems | null,
  ) {
    if (!customer?.isActive) {
      throw new AppException(
        AppException.errorCodes.order.INACTIVE_CUSTOMER,
        "Sua conta foi bloqueada. Por favor, entre em contato com o suporte.",
        AppException.HttpStatus.FORBIDDEN,
      );
    }

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

  private async assertCouponIsRedeemable(
    coupon: Coupon,
    productsTotalLessDiscount: number,
    customerId: string,
  ) {
    if (this.couponsService.isCouponUnavailable(coupon)) {
      throw new AppException(
        AppException.errorCodes.order.COUPON_UNAVAILABLE,
        "Cupom indisponível",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    if (productsTotalLessDiscount < coupon.minOrderValue) {
      throw new AppException(
        AppException.errorCodes.order.COUPON_MIN_ORDER_NOT_MET,
        "O valor do carrinho não atinge o mínimo para este cupom",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    const hasReachedUsageLimit = await this.couponsService.hasReachedUsageLimit(
      coupon.id,
      coupon.usageLimit,
    );

    if (hasReachedUsageLimit) {
      throw new AppException(
        AppException.errorCodes.order.COUPON_USAGE_LIMIT_REACHED,
        "Este cupom atingiu o limite de uso",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    const alreadyUsed = await this.couponsService.hasCustomerUsedCoupon(
      coupon.id,
      customerId,
    );

    if (alreadyUsed) {
      throw new AppException(
        AppException.errorCodes.order.COUPON_ALREADY_USED,
        "Você já utilizou este cupom",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    const isEligible = await this.couponsService.isCustomerEligibleForCoupon(
      coupon.id,
      customerId,
    );

    if (!isEligible) {
      throw new AppException(
        AppException.errorCodes.order.COUPON_NOT_ELIGIBLE,
        "Este cupom não está disponível para você.",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }
  }

  private assertOrderMeetsMinValue(
    productsTotalLessDiscount: number,
    couponDiscount: number,
    settings: Record<SettingKey, string>,
  ) {
    const minOrderValue = Number(settings?.MIN_ORDER_VALUE || 0);
    const deliveryFee = Number(settings?.DELIVERY_FEE || 0);

    if (minOrderValue <= 0) {
      return;
    }

    const total = productsTotalLessDiscount + deliveryFee - couponDiscount;

    if (total < minOrderValue) {
      const formattedMinValue = (minOrderValue / 100)
        .toFixed(2)
        .replace(".", ",");

      throw new AppException(
        AppException.errorCodes.order.BELOW_MIN_ORDER_VALUE,
        `O valor mínimo para realizar um pedido é de R$ ${formattedMinValue}.`,
        AppException.HttpStatus.BAD_REQUEST,
      );
    }
  }

  private assertThereAreInvalidItemsInCart(
    cartItems: Array<
      CartItem & {
        product: Product;
      }
    >,
  ) {
    const cartItemExceedingStockOrInactive = cartItems.find(
      (item) =>
        item.quantity > item.product.stockQuantity ||
        !item.product.isActive ||
        item.product.deletedAt !== null,
    );

    if (cartItemExceedingStockOrInactive) {
      const productName = cartItemExceedingStockOrInactive.product.name;
      const productStock =
        cartItemExceedingStockOrInactive.product.stockQuantity;
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
