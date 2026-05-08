import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "../shared/database/prisma/prisma.service";
import { AddToCartDto, RemoveFromCartDto } from "./dtos";
import { CartItem, Product } from "../shared/database/prisma/generated/client";
import { AppException } from "../shared/exceptions/app.exception";
import { ErrorCodes } from "../shared/exceptions/error-codes";

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async getCart(deviceId: string) {
    const customer = await this.findCustomerWithCartOrThrow(deviceId);

    return this.formatCart(customer.cart.items);
  }

  async addToCart(deviceId: string, dto: AddToCartDto) {
    const { productId } = dto;

    const customer = await this.findCustomerWithCartOrThrow(deviceId);

    const isProductInCart = customer.cart.items.some(
      (item) => item.productId === productId,
    );

    if (isProductInCart) {
      throw new AppException(
        ErrorCodes.cart.PRODUCT_ALREADY_IN_CART,
        "Produto já está no carrinho",
        HttpStatus.BAD_REQUEST,
      );
    }

    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        isActive: true,
        deletedAt: null,
      },
    });

    if (!product) {
      throw new AppException(
        ErrorCodes.cart.PRODUCT_NOT_EXIST,
        "Produto não encontrado",
        HttpStatus.NOT_FOUND,
      );
    }

    const updatedCart = await this.prisma.cart.update({
      where: { id: customer.cart.id },
      data: {
        items: {
          create: {
            productId,
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

  async incrementProductQuantity(deviceId: string, dto: AddToCartDto) {
    const { productId } = dto;

    const customer = await this.findCustomerWithCartOrThrow(deviceId);

    const cartItem = customer.cart.items.find(
      (item) => item.productId === productId,
    );

    if (!cartItem) {
      throw new AppException(
        ErrorCodes.cart.PRODUCT_NOT_EXIST,
        "Produto não existe no carrinho",
        HttpStatus.BAD_REQUEST,
      );
    }

    const updatedCart = await this.prisma.cart.update({
      where: { id: customer.cart.id },
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

  async decrementProductQuantity(deviceId: string, dto: AddToCartDto) {
    const { productId } = dto;

    const customer = await this.findCustomerWithCartOrThrow(deviceId);

    const cartItem = customer.cart.items.find(
      (item) => item.productId === productId,
    );

    if (!cartItem) {
      throw new AppException(
        ErrorCodes.cart.PRODUCT_NOT_EXIST,
        "Produto não existe no carrinho",
        HttpStatus.BAD_REQUEST,
      );
    }

    if (cartItem.quantity === 1) {
      const updatedCart = await this.prisma.cart.update({
        where: { id: customer.cart.id },
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
      where: { id: customer.cart.id },
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

  async removeFromCart(deviceId: string, dto: RemoveFromCartDto) {
    const { productId } = dto;

    const customer = await this.findCustomerWithCartOrThrow(deviceId);

    const isProductInCart = customer.cart.items.some(
      (item) => item.productId === productId,
    );

    if (!isProductInCart) {
      throw new AppException(
        ErrorCodes.cart.PRODUCT_NOT_EXIST,
        "Produto não existe no carrinho",
        HttpStatus.BAD_REQUEST,
      );
    }

    const updatedCart = await this.prisma.cart.update({
      where: { id: customer.cart.id },
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

  private async findCustomerWithCartOrThrow(deviceId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { deviceId, isActive: true, deletedAt: null },
      include: {
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
        ErrorCodes.cart.CUSTOMER_NOT_FOUND,
        "Cliente não encontrado",
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!customer?.cart) {
      throw new AppException(
        ErrorCodes.cart.CUSTOMER_CART_NOT_FOUND,
        "Carrinho não encontrado para este cliente",
        HttpStatus.BAD_REQUEST,
      );
    }

    return {
      ...customer,
      cart: {
        ...customer.cart!,
        items: customer.cart!.items,
      },
    };
  }

  private formatCart(
    cartItems: Array<
      CartItem & {
        product: Product;
      }
    >,
  ) {
    let deliveryFee = 200; //TODO: calcular frete real

    if (!cartItems.length) {
      deliveryFee = 0;
    }

    const productsCount = cartItems.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );
    const subtotal = cartItems.reduce(
      (sum, item) => sum + item.product.price * item.quantity,
      0,
    );

    return {
      products: cartItems.map((cartItem) => {
        const { product, quantity } = cartItem;

        return {
          id: product.id,
          name: product.name,
          description: product.description,
          price: product.price * quantity,
          imageUrl: product.imageUrl,
          quantity,
        };
      }),
      deliveryFee,
      subtotal,
      productsCount,
      total: subtotal + deliveryFee,
    };
  }
}
