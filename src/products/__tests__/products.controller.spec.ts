import { Test, TestingModule } from "@nestjs/testing";
import { ProductsController } from "../products.controller";
import { ProductsService } from "../products.service";
import { productsServiceMock } from "@shared/testing/mocks";

const session = { deviceId: "device-123" };

describe("ProductsController", () => {
  let controller: ProductsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [{ provide: ProductsService, useValue: productsServiceMock }],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("findBestSellers", () => {
    it("should return best sellers from ProductsService without a category", async () => {
      const products = [
        { id: "p1", name: "Product 1" },
        { id: "p2", name: "Product 2" },
      ];
      productsServiceMock.findBestSellers.mockResolvedValue(products);

      const result = await controller.findBestSellers(session);

      expect(result).toEqual(products);
      expect(productsServiceMock.findBestSellers).toHaveBeenCalledWith(
        session.deviceId,
        undefined,
      );
    });

    it("should return best sellers from ProductsService with a category", async () => {
      const products = [
        { id: "p3", name: "Product 3" },
        { id: "p4", name: "Product 4" },
      ];
      const category = "Cerveja";
      productsServiceMock.findBestSellers.mockResolvedValue(products);

      const result = await controller.findBestSellers(session, category);

      expect(result).toEqual(products);
      expect(productsServiceMock.findBestSellers).toHaveBeenCalledWith(
        session.deviceId,
        category,
      );
    });
  });
});
