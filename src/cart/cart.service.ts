import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AddToCartDto, AssignCouponToCartDto, RemoveFromCartDto } from "./dtos";
import {
  CartItem,
  Coupon,
  Product,
  SettingKey,
} from "@shared/database/prisma/generated/client";
import { AppException } from "@shared/exceptions/app.exception";
import { ICurrentSession } from "@shared/types/jwt";
import { SettingsService } from "../settings/settings.service";
import {
  CouponsService,
  WELCOME_COUPON_CODE,
} from "../coupons/coupons.service";
import { isUniqueConstraintViolation } from "@shared/helpers/prisma-errors";
import { computeProductsTotals } from "@shared/helpers/products-totals";

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly couponsService: CouponsService,
  ) {}

  async getCart(session: ICurrentSession) {
    const customerOrAnonymous =
      await this.findAnonymousOrCustomerWithCartOrThrow(session);

    return this.formatCart(customerOrAnonymous.cart, session);
  }

  async addToCart(session: ICurrentSession, dto: AddToCartDto) {
    const { productId } = dto;

    const customerOrAnonymous =
      await this.findAnonymousOrCustomerWithCartOrThrow(session);

    const isProductInCart = customerOrAnonymous.cart.items.some(
      (item) => item.productId === productId,
    );

    if (isProductInCart) {
      throw new AppException(
        AppException.errorCodes.cart.PRODUCT_ALREADY_IN_CART,
        "Produto já existe no carrinho",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        stockQuantity: true,
      },
    });

    if (!product) {
      throw new AppException(
        AppException.errorCodes.cart.PRODUCT_NOT_FOUND,
        "Produto não encontrado",
        AppException.HttpStatus.NOT_FOUND,
      );
    }

    if (product.stockQuantity < 1) {
      throw new AppException(
        AppException.errorCodes.cart.PRODUCT_OUT_OF_STOCK,
        "Produto sem estoque disponível",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const updatedCart = await this.prisma.cart.update({
        where: { id: customerOrAnonymous.cart.id },
        data: {
          items: {
            create: {
              productId: product.id,
              quantity: 1,
            },
          },
        },
        select: {
          items: {
            include: {
              product: true,
            },
          },
          coupon: true,
        },
      });

      return this.formatCart(updatedCart, session);
    } catch (error) {
      // Em requisições concorrentes, a checagem em memória acima pode não
      // enxergar o item recém-adicionado. A constraint única (cartId, productId)
      // garante a unicidade e o conflito (P2002) é traduzido para o erro de
      // negócio em vez de virar um 500.
      if (isUniqueConstraintViolation(error)) {
        throw new AppException(
          AppException.errorCodes.cart.PRODUCT_ALREADY_IN_CART,
          "Produto já existe no carrinho",
          AppException.HttpStatus.BAD_REQUEST,
        );
      }

      throw error;
    }
  }

  async assignCouponToCart(
    session: ICurrentSession,
    dto: AssignCouponToCartDto,
  ) {
    if (!session?.customerId) {
      throw new AppException(
        AppException.errorCodes.cart.COUPON_REQUIRES_AUTH,
        "Faça login para utilizar um cupom",
        AppException.HttpStatus.UNAUTHORIZED,
      );
    }

    const customerOrAnonymous =
      await this.findAnonymousOrCustomerWithCartOrThrow(session);

    const coupon = await this.prisma.coupon.findFirst({
      where: { code: { equals: dto.couponCode, mode: "insensitive" } },
      orderBy: { createdAt: "asc" },
    });

    if (!coupon) {
      throw new AppException(
        AppException.errorCodes.cart.COUPON_NOT_FOUND,
        "Cupom indisponível",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    if (this.couponsService.isCouponUnavailable(coupon)) {
      throw new AppException(
        AppException.errorCodes.cart.COUPON_UNAVAILABLE,
        "Cupom indisponível",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    const { productsTotalLessDiscount } = this.computeCartProductsTotals(
      customerOrAnonymous.cart.items,
    );

    if (productsTotalLessDiscount < coupon.minOrderValue) {
      throw new AppException(
        AppException.errorCodes.cart.COUPON_MIN_ORDER_NOT_MET,
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
        AppException.errorCodes.cart.COUPON_USAGE_LIMIT_REACHED,
        "Cupom indisponível",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    const alreadyUsed = await this.couponsService.hasCustomerUsedCoupon(
      coupon.id,
      session.customerId,
    );

    if (alreadyUsed) {
      throw new AppException(
        AppException.errorCodes.cart.COUPON_ALREADY_USED,
        "Você já utilizou este cupom",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    const updatedCart = await this.prisma.cart.update({
      where: { id: customerOrAnonymous.cart.id },
      data: { couponId: coupon.id },
      select: {
        items: {
          include: {
            product: true,
          },
        },
        coupon: true,
      },
    });

    return this.formatCart(updatedCart, session);
  }

  async removeCouponFromCart(session: ICurrentSession) {
    const customerOrAnonymous =
      await this.findAnonymousOrCustomerWithCartOrThrow(session);

    if (!customerOrAnonymous.cart.couponId) {
      throw new AppException(
        AppException.errorCodes.cart.COUPON_NOT_ASSIGNED,
        "Nenhum cupom aplicado ao carrinho",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    const updatedCart = await this.prisma.cart.update({
      where: { id: customerOrAnonymous.cart.id },
      data: { couponId: null },
      select: {
        items: {
          include: {
            product: true,
          },
        },
        coupon: true,
      },
    });

    return this.formatCart(updatedCart, session);
  }

  async incrementProductQuantity(session: ICurrentSession, dto: AddToCartDto) {
    const { productId } = dto;

    const customerOrAnonymous =
      await this.findAnonymousOrCustomerWithCartOrThrow(session);

    const cartItem = customerOrAnonymous.cart.items.find(
      (item) => item.productId === productId,
    );

    if (!cartItem) {
      throw new AppException(
        AppException.errorCodes.cart.PRODUCT_NOT_FOUND_IN_CART,
        "Produto não existe no carrinho",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    if (!cartItem.product.isActive) {
      throw new AppException(
        AppException.errorCodes.cart.PRODUCT_INACTIVE,
        "Produto não está mais disponível",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    if (cartItem.product.stockQuantity <= 10) {
      if (cartItem.quantity + 1 > cartItem.product.stockQuantity) {
        throw new AppException(
          AppException.errorCodes.cart.PRODUCT_OUT_OF_STOCK,
          "Quantidade solicitada excede o estoque disponível",
          AppException.HttpStatus.BAD_REQUEST,
        );
      }
    }

    const updatedCart = await this.prisma.cart.update({
      where: { id: customerOrAnonymous.cart.id },
      data: {
        items: {
          update: {
            where: { id: cartItem.id },
            data: {
              quantity: {
                increment: 1,
              },
            },
          },
        },
      },
      select: {
        items: {
          include: {
            product: true,
          },
        },
        coupon: true,
      },
    });

    return this.formatCart(updatedCart, session);
  }

  async decrementProductQuantity(session: ICurrentSession, dto: AddToCartDto) {
    const { productId } = dto;

    const customerOrAnonymous =
      await this.findAnonymousOrCustomerWithCartOrThrow(session);

    const cartItem = customerOrAnonymous.cart.items.find(
      (item) => item.productId === productId,
    );

    if (!cartItem) {
      throw new AppException(
        AppException.errorCodes.cart.PRODUCT_NOT_FOUND_IN_CART,
        "Produto não existe no carrinho",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    if (cartItem.quantity === 1) {
      const updatedCart = await this.prisma.cart.update({
        where: { id: customerOrAnonymous.cart.id },
        data: {
          items: {
            deleteMany: { productId },
          },
        },
        select: {
          items: {
            include: { product: true },
          },
          coupon: true,
        },
      });

      return this.formatCart(updatedCart, session);
    }

    const updatedCart = await this.prisma.cart.update({
      where: { id: customerOrAnonymous.cart.id },
      data: {
        items: {
          update: {
            where: { id: cartItem.id },
            data: {
              quantity: {
                decrement: 1,
              },
            },
          },
        },
      },
      select: {
        items: {
          include: { product: true },
        },
        coupon: true,
      },
    });

    return this.formatCart(updatedCart, session);
  }

  async removeFromCart(session: ICurrentSession, dto: RemoveFromCartDto) {
    const { productId } = dto;

    const customerOrAnonymous =
      await this.findAnonymousOrCustomerWithCartOrThrow(session);

    const isProductInCart = customerOrAnonymous.cart.items.some(
      (item) => item.productId === productId,
    );

    if (!isProductInCart) {
      throw new AppException(
        AppException.errorCodes.cart.PRODUCT_NOT_FOUND_IN_CART,
        "Produto não existe no carrinho",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    const updatedCart = await this.prisma.cart.update({
      where: { id: customerOrAnonymous.cart.id },
      data: {
        items: {
          deleteMany: {
            productId,
          },
        },
      },
      select: {
        items: {
          include: {
            product: true,
          },
        },
        coupon: true,
      },
    });

    return this.formatCart(updatedCart, session);
  }

  private async findAnonymousOrCustomerWithCartOrThrow(
    session: ICurrentSession,
  ) {
    const include = {
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
    };

    if (!session?.deviceId && !session?.customerId) {
      throw new AppException(
        AppException.errorCodes.cart.INVALID_SESSION,
        "Sessão inválida",
        AppException.HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!session?.customerId) {
      const anonymousCustomer = await this.prisma.anonymousCustomer.findUnique({
        where: { deviceId: session.deviceId },
        include,
      });

      if (!anonymousCustomer) {
        throw new AppException(
          AppException.errorCodes.cart.ANONYMOUS_CUSTOMER_NOT_FOUND,
          "Cliente não encontrado",
          AppException.HttpStatus.BAD_REQUEST,
        );
      }

      if (!anonymousCustomer?.cart) {
        throw new AppException(
          AppException.errorCodes.cart.CART_NOT_FOUND,
          "Carrinho não encontrado",
          AppException.HttpStatus.BAD_REQUEST,
        );
      }

      return {
        ...anonymousCustomer,
        cart: {
          ...anonymousCustomer.cart,
          items: anonymousCustomer.cart.items,
        },
      };
    }

    const customer = await this.prisma.customer.findFirst({
      where: { id: session.customerId },
      include,
    });

    if (!customer) {
      throw new AppException(
        AppException.errorCodes.cart.CUSTOMER_NOT_FOUND,
        "Cliente não encontrado",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    if (!customer?.cart) {
      throw new AppException(
        AppException.errorCodes.cart.CART_NOT_FOUND,
        "Carrinho não encontrado",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    return {
      ...customer,
      cart: {
        ...customer.cart,
        items: customer.cart.items,
      },
    };
  }

  private computeCartProductsTotals(
    items: Array<CartItem & { product: Product }>,
  ) {
    return computeProductsTotals(
      items.map(({ product, quantity }) => ({
        price: product.price,
        compareAtPrice: product.compareAtPrice,
        quantity,
      })),
    );
  }

  private async formatCart(
    cart: {
      coupon?: Coupon | null;
      items: Array<
        CartItem & {
          product: Product;
        }
      >;
    },
    session: ICurrentSession,
  ) {
    const settings = await this.settingsService.findAll();
    const minOrderValue = Number(settings?.MIN_ORDER_VALUE || 0);
    const deliveryFee = Number(settings?.DELIVERY_FEE || 0);

    const {
      productsTotal,
      productsDiscount,
      productsCount,
      productsTotalLessDiscount,
    } = this.computeCartProductsTotals(cart.items);

    let isWelcomeCoupon = false;
    let welcomeDiscount = 0;

    if (!cart.coupon && SettingKey.WELCOME_COUPON in settings) {
      isWelcomeCoupon = session?.customerId
        ? await this.couponsService.isCustomerEligibleForWelcomeCoupon(
            session.customerId,
          )
        : true;
    }

    if (isWelcomeCoupon) {
      welcomeDiscount = await this.couponsService.calculateWelcomeDiscount(
        productsTotalLessDiscount,
        settings,
      );
    }

    const couponDiscount = cart.coupon
      ? this.couponsService.calculateDiscount(
          cart.coupon,
          productsTotalLessDiscount,
        )
      : welcomeDiscount;

    const total = productsTotalLessDiscount + deliveryFee - couponDiscount;

    return {
      products: cart.items.map((cartItem) => {
        const { product, quantity } = cartItem;

        let remainingStock: number | null = null;

        if (product.stockQuantity <= 10) {
          remainingStock = product.stockQuantity;
        }

        if (!product.isActive) {
          remainingStock = 0;
        }

        return {
          id: product.id,
          name: product.name,
          description: product.description,
          price: product.price,
          imageUrl: product.imageUrl,
          compareAtPrice: product.compareAtPrice,
          remainingStock,
          quantity,
        };
      }),
      minOrderValue,
      remainingToMinOrderValue: productsTotal
        ? Math.max(minOrderValue - total, 0)
        : 0,
      outsideBusinessHours: settings?.OUTSIDE_BUSINESS_HOURS ?? null,
      onBreak: settings?.ON_BREAK ?? null,
      deliveryFee: productsTotal ? deliveryFee : 0,
      productsTotal,
      productsCount,
      productsDiscount,
      couponDiscount,
      couponCode:
        cart?.coupon?.code ?? (isWelcomeCoupon ? WELCOME_COUPON_CODE : null),
      isWelcomeCoupon,
      total: productsTotal ? total : 0,
    };
  }
}
