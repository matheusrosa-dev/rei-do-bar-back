import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../shared/database/prisma/prisma.service";
import { AddToCartDto } from "./dtos";
import { CartItem, Product } from "../shared/database/prisma/generated/client";

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async addToCart(deviceId: string, dto: AddToCartDto) {
    const { productId } = dto;

    const customer = await this.prisma.customer.findUnique({
      where: { deviceId, isActive: true, deletedAt: null },
      include: {
        cart: {
          include: {
            items: true,
          },
        },
      },
    });

    if (!customer) {
      throw new BadRequestException("Cliente não encontrado");
    }

    if (!customer?.cart) {
      throw new BadRequestException(
        "Carrinho não encontrado para este cliente",
      );
    }

    const isProductInCart = customer.cart.items.some(
      (item) => item.productId === productId,
    );

    if (isProductInCart) {
      throw new BadRequestException("Produto já está no carrinho");
    }

    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        isActive: true,
        deletedAt: null,
      },
    });

    if (!product) {
      throw new NotFoundException("Produto não encontrado");
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

  async getCart(deviceId: string) {
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
      throw new BadRequestException("Cliente não encontrado");
    }

    if (!customer?.cart) {
      throw new BadRequestException(
        "Carrinho não encontrado para este cliente",
      );
    }

    return this.formatCart(customer.cart.items);
  }

  private formatCart(
    cartItems: Array<
      CartItem & {
        product: Product;
      }
    >,
  ) {
    const deliveryFee = 500; //TODO: calcular frete real
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
          price: product.price,
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
