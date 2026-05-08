import { Test, TestingModule } from "@nestjs/testing";
import { CategoriesService } from "../categories.service";
import { PrismaService } from "../../shared/database/prisma/prisma.service";

const prismaMock = {
  category: {
    findMany: jest.fn(),
  },
};

describe("CategoriesService", () => {
  let service: CategoriesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("findAll", () => {
    it("should return all active categories", async () => {
      const categories = [
        { id: "1", name: "Bebidas", pluralName: "Bebidas" },
        { id: "2", name: "Petisco", pluralName: "Petiscos" },
      ];
      prismaMock.category.findMany.mockResolvedValue(categories);

      const result = await service.findAll();

      expect(result).toEqual(categories);
      expect(prismaMock.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true, deletedAt: null },
          select: { id: true, name: true, pluralName: true },
        }),
      );
    });

    it("should return empty array when no active categories exist", async () => {
      prismaMock.category.findMany.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });
});
