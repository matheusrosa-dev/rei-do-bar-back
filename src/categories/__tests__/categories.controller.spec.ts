import { Test, TestingModule } from "@nestjs/testing";
import { CategoriesController } from "../categories.controller";
import { CategoriesService } from "../categories.service";
import { categoriesServiceMock } from "@shared/testing/mocks";

describe("CategoriesController", () => {
  let controller: CategoriesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [
        { provide: CategoriesService, useValue: categoriesServiceMock },
      ],
    }).compile();

    controller = module.get<CategoriesController>(CategoriesController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("findAll", () => {
    it("should return all categories from CategoriesService", async () => {
      const categories = [
        { id: "cat-1", name: "Category 1" },
        { id: "cat-2", name: "Category 2" },
      ];
      categoriesServiceMock.findAll.mockResolvedValue(categories);

      const result = await controller.findAll();

      expect(result).toEqual(categories);
      expect(categoriesServiceMock.findAll).toHaveBeenCalledTimes(1);
    });
  });
});
