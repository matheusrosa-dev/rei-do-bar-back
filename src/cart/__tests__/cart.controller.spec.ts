import { Test, TestingModule } from "@nestjs/testing";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { CartController } from "../cart.controller";
import { CartService } from "../cart.service";
import { AddToCartDto } from "../dtos/add-to-cart";
import { IncrementProductQuantityDto } from "../dtos/increment-product-quantity";
import { DecrementProductQuantityDto } from "../dtos/decrement-product-quantity";
import { RemoveFromCartDto } from "../dtos/remove-from-cart";

const cartServiceMock = {
  getCart: jest.fn(),
  addToCart: jest.fn(),
  incrementProductQuantity: jest.fn(),
  decrementProductQuantity: jest.fn(),
  removeFromCart: jest.fn(),
};

const session = { deviceId: "device-123" };

const cartResponse = {
  products: [],
  subtotal: 0,
  deliveryFee: 0,
  total: 0,
  productsCount: 0,
};

describe("CartController", () => {
  let controller: CartController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CartController],
      providers: [{ provide: CartService, useValue: cartServiceMock }],
    }).compile();

    controller = module.get<CartController>(CartController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("getCart", () => {
    it("should return the cart from CartService", async () => {
      cartServiceMock.getCart.mockResolvedValue(cartResponse);

      const result = await controller.getCart(session);

      expect(result).toEqual(cartResponse);
      expect(cartServiceMock.getCart).toHaveBeenCalledWith(session.deviceId);
    });
  });

  describe("addToCart", () => {
    it("should add a product and return updated cart", async () => {
      const dto = { productId: "p1" };
      cartServiceMock.addToCart.mockResolvedValue(cartResponse);

      const result = await controller.addToCart(session, dto);

      expect(result).toEqual(cartResponse);
      expect(cartServiceMock.addToCart).toHaveBeenCalledWith(
        session.deviceId,
        dto,
      );
    });
  });

  describe("incrementProductQuantity", () => {
    it("should increment product quantity and return updated cart", async () => {
      const dto = { productId: "p1" };
      cartServiceMock.incrementProductQuantity.mockResolvedValue(cartResponse);

      const result = await controller.incrementProductQuantity(session, dto);

      expect(result).toEqual(cartResponse);
      expect(cartServiceMock.incrementProductQuantity).toHaveBeenCalledWith(
        session.deviceId,
        dto,
      );
    });
  });

  describe("decrementProductQuantity", () => {
    it("should decrement product quantity and return updated cart", async () => {
      const dto = { productId: "p1" };
      cartServiceMock.decrementProductQuantity.mockResolvedValue(cartResponse);

      const result = await controller.decrementProductQuantity(session, dto);

      expect(result).toEqual(cartResponse);
      expect(cartServiceMock.decrementProductQuantity).toHaveBeenCalledWith(
        session.deviceId,
        dto,
      );
    });
  });

  describe("removeFromCart", () => {
    it("should remove a product and return updated cart", async () => {
      const dto = { productId: "p1" };
      cartServiceMock.removeFromCart.mockResolvedValue(cartResponse);

      const result = await controller.removeFromCart(session, dto);

      expect(result).toEqual(cartResponse);
      expect(cartServiceMock.removeFromCart).toHaveBeenCalledWith(
        session.deviceId,
        dto,
      );
    });
  });

  describe("DTO validation", () => {
    const validUuid = "123e4567-e89b-12d3-a456-426614174000";
    const invalidValues = ["", "not-a-uuid", "123"];

    const dtoClasses = [
      { name: "AddToCartDto", cls: AddToCartDto },
      { name: "IncrementProductQuantityDto", cls: IncrementProductQuantityDto },
      { name: "DecrementProductQuantityDto", cls: DecrementProductQuantityDto },
      { name: "RemoveFromCartDto", cls: RemoveFromCartDto },
    ];

    for (const { name, cls } of dtoClasses) {
      describe(name, () => {
        it("should pass with a valid UUID", async () => {
          const dto = plainToInstance(cls, { productId: validUuid });
          const errors = await validate(dto);
          expect(errors).toHaveLength(0);
        });

        for (const value of invalidValues) {
          it(`should fail when productId is "${value || "(empty string)"}"`, async () => {
            const dto = plainToInstance(cls, { productId: value });
            const errors = await validate(dto);
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0].property).toBe("productId");
          });
        }

        it("should fail when productId is missing", async () => {
          const dto = plainToInstance(cls, {});
          const errors = await validate(dto);
          expect(errors.length).toBeGreaterThan(0);
          expect(errors[0].property).toBe("productId");
        });
      });
    }
  });
});
