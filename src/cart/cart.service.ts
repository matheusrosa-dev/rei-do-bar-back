import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AddToCartDto, RemoveFromCartDto } from "./dtos";
import {
  CartItem,
  Product,
  SettingKey,
} from "@shared/database/prisma/generated/client";
import { AppException } from "@shared/exceptions/app.exception";
import { ICurrentSession } from "@shared/types/jwt";

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async getCart(session: ICurrentSession) {
    const customerOrAnonymous =
      await this.findAnonymousOrCustomerWithCartOrThrow(session);

    return this.formatCart(customerOrAnonymous.cart.items);
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
      },
      select: {
        id: true,
        stock: true,
      },
    });

    if (!product) {
      throw new AppException(
        AppException.errorCodes.cart.PRODUCT_NOT_FOUND,
        "Produto não encontrado",
        AppException.HttpStatus.NOT_FOUND,
      );
    }

    if (product.stock < 1) {
      throw new AppException(
        AppException.errorCodes.cart.PRODUCT_OUT_OF_STOCK,
        "Produto sem estoque disponível",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

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
      },
    });

    return this.formatCart(updatedCart.items);
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

    if (cartItem.product.stock <= 10) {
      if (cartItem.quantity + 1 > cartItem.product.stock) {
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
            data: { quantity: cartItem.quantity + 1 },
          },
        },
      },
      select: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    return this.formatCart(updatedCart.items);
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
        },
      });

      return this.formatCart(updatedCart.items);
    }

    const updatedCart = await this.prisma.cart.update({
      where: { id: customerOrAnonymous.cart.id },
      data: {
        items: {
          update: {
            where: { id: cartItem.id },
            data: { quantity: cartItem.quantity - 1 },
          },
        },
      },
      select: {
        items: {
          include: { product: true },
        },
      },
    });

    return this.formatCart(updatedCart.items);
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
      },
    });

    return this.formatCart(updatedCart.items);
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
        },
      },
    };

    if (
      (!session?.deviceId && !session?.customerId) ||
      (session?.deviceId && session?.customerId)
    ) {
      throw new Error("Session must have either deviceId or customerId");
    }

    if (session?.deviceId) {
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

    const customer = await this.prisma.customer.findUnique({
      where: { id: session.customerId, isActive: true },
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

  private async formatCart(
    cartItems: Array<
      CartItem & {
        product: Product;
      }
    >,
  ) {
    const stringfiedDeliveryFee = await this.prisma.setting.findUnique({
      where: { key: SettingKey.DELIVERY_FEE },
    });

    let deliveryFee = Number(stringfiedDeliveryFee!.value);

    if (!cartItems.length) {
      deliveryFee = 0;
    }

    let productsCount = 0;

    const subtotal = cartItems.reduce((sum, item) => {
      productsCount += item.quantity;
      return sum + item.product.price * item.quantity;
    }, 0);

    const total = subtotal + deliveryFee;

    return {
      products: cartItems.map((cartItem) => {
        const { product, quantity } = cartItem;

        return {
          id: product.id,
          name: product.name,
          description: product.description,
          price: product.price * quantity,
          imageUrl: product.imageUrl,
          remainingStock: product.stock <= 10 ? product.stock : null,
          quantity,
        };
      }),
      deliveryFee,
      subtotal,
      productsCount,
      total,
    };
  }
}
