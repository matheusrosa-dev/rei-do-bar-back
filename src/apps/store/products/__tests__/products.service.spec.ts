/** biome-ignore-all lint/suspicious/noExplicitAny: <private methods are reached through an any cast> */
import { Test, TestingModule } from "@nestjs/testing";
import { ProductsService } from "../products.service";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { prismaMock } from "@shared/testing/mocks";
import { ProductFactory } from "@shared/testing/factories";
import type { ICurrentSession } from "@shared/types/jwt";

type ProductProps = {
  id?: string;
  name?: string;
  description?: string;
  compareAtPrice?: number | null;
  stockQuantity: number;
  sortOrder?: number;
};

const buildProduct = (props: ProductProps) => {
  const product = ProductFactory.createOne(props);

  return {
    id: product.id,
    name: product.name,
    description: product.description,
    compareAtPrice: product.compareAtPrice,
    price: product.price,
    imageUrl: product.imageUrl,
    stockQuantity: product.stockQuantity,
    sortOrder: product.sortOrder,
  };
};

type CatalogProduct = ReturnType<typeof buildProduct>;

const buildCategory = (id: string, products: CatalogProduct[]) => ({
  id,
  name: `categoria-${id}`,
  pluralName: `categorias-${id}`,
  imageUrl: `https://cdn.test/${id}.png`,
  products,
});

const buildCategoryGroup = (
  id: string,
  categories: ReturnType<typeof buildCategory>[],
) => ({
  id,
  name: `grupo-${id}`,
  allProductsImageUrl: `https://cdn.test/${id}-todos.png`,
  promotionsImageUrl: `https://cdn.test/${id}-promocoes.png`,
  categories,
});

const idsOf = (items: { id: string }[]) => items.map(({ id }) => id);

type EnrichedProduct = {
  id: string;
  quantityInCart: number;
  remainingStock: number | null;
};

const productsOf = (category: { products: { id: string }[] }) =>
  category.products as EnrichedProduct[];

const anonymousSession: ICurrentSession = { deviceId: "device-123" };
const customerSession: ICurrentSession = { customerId: "customer-123" };

const mockCart = (items: { productId: string; quantity: number }[] | null) => {
  const owner = items === null ? null : { cart: { items } };
  prismaMock.anonymousCustomer.findUnique.mockResolvedValue(owner);
  prismaMock.customer.findFirst.mockResolvedValue(owner);
};

const sessionCases = [
  { label: "anonymous session", session: anonymousSession },
  { label: "customer session", session: customerSession },
];

describe("ProductsService", () => {
  let service: ProductsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);

    prismaMock.categoryGroup.findMany.mockResolvedValue([]);
    prismaMock.product.findMany.mockResolvedValue([]);
    mockCart([]);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("findCatalog", () => {
    it("should query only active groups, categories and non-deleted products, ordered by sortOrder then id", async () => {
      await service.findCatalog(anonymousSession);

      expect(prismaMock.categoryGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          select: expect.objectContaining({
            categories: expect.objectContaining({
              where: { isActive: true },
              orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
              select: expect.objectContaining({
                products: expect.objectContaining({
                  where: { isActive: true, deletedAt: null },
                  orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
                }),
              }),
            }),
          }),
        }),
      );
    });

    it("should return an empty array when no group is found", async () => {
      prismaMock.categoryGroup.findMany.mockResolvedValue([]);

      await expect(service.findCatalog(anonymousSession)).resolves.toEqual([]);
    });

    it("should prepend the 'Todos' pseudo-category carrying the group's allProductsImageUrl and every product of the group", async () => {
      const first = buildProduct({
        id: "p-1",
        stockQuantity: 50,
        sortOrder: 1,
      });
      const second = buildProduct({
        id: "p-2",
        stockQuantity: 50,
        sortOrder: 2,
      });
      const group = buildCategoryGroup("g-1", [
        buildCategory("c-1", [first]),
        buildCategory("c-2", [second]),
      ]);
      prismaMock.categoryGroup.findMany.mockResolvedValue([group]);

      const [categoryGroup] = await service.findCatalog(anonymousSession);

      expect(categoryGroup.categories[0]).toEqual(
        expect.objectContaining({
          id: "Todos",
          name: "Todos",
          pluralName: "Todos",
          imageUrl: group.allProductsImageUrl,
        }),
      );
      expect(idsOf(categoryGroup.categories[0].products)).toEqual([
        "p-1",
        "p-2",
      ]);
    });

    it("should append the real categories after the pseudo-categories", async () => {
      const group = buildCategoryGroup("g-1", [
        buildCategory("c-1", [
          buildProduct({ id: "p-1", stockQuantity: 50, sortOrder: 1 }),
        ]),
        buildCategory("c-2", [
          buildProduct({ id: "p-2", stockQuantity: 50, sortOrder: 2 }),
        ]),
      ]);
      prismaMock.categoryGroup.findMany.mockResolvedValue([group]);

      const [categoryGroup] = await service.findCatalog(anonymousSession);

      expect(idsOf(categoryGroup.categories)).toEqual(["Todos", "c-1", "c-2"]);
    });

    it("should repeat the whole enriched product in the real category and in the pseudo-categories", async () => {
      const group = buildCategoryGroup("g-1", [
        buildCategory("c-1", [
          buildProduct({
            id: "p-1",
            stockQuantity: 4,
            sortOrder: 1,
            compareAtPrice: 2000,
          }),
        ]),
        buildCategory("c-2", [
          buildProduct({ id: "p-2", stockQuantity: 50, sortOrder: 2 }),
        ]),
      ]);
      prismaMock.categoryGroup.findMany.mockResolvedValue([group]);
      mockCart([{ productId: "p-1", quantity: 2 }]);

      const [categoryGroup] = await service.findCatalog(anonymousSession);
      const [all, promotions, realCategory] = categoryGroup.categories;
      const enriched = {
        ...group.categories[0].products[0],
        quantityInCart: 2,
        remainingStock: 4,
      };

      expect(productsOf(realCategory)).toEqual([enriched]);
      expect(productsOf(all)[0]).toEqual(enriched);
      expect(productsOf(promotions)).toEqual([enriched]);
    });

    it("should add a 'Promoções' pseudo-category with the group's promotionsImageUrl holding only products with a compareAtPrice", async () => {
      const promotion = buildProduct({
        id: "p-1",
        stockQuantity: 50,
        sortOrder: 1,
        compareAtPrice: 2000,
      });
      const regular = buildProduct({
        id: "p-2",
        stockQuantity: 50,
        sortOrder: 2,
      });
      const group = buildCategoryGroup("g-1", [
        buildCategory("c-1", [promotion]),
        buildCategory("c-2", [regular]),
      ]);
      prismaMock.categoryGroup.findMany.mockResolvedValue([group]);

      const [categoryGroup] = await service.findCatalog(anonymousSession);

      expect(categoryGroup.categories[1]).toEqual(
        expect.objectContaining({
          id: "Promoções",
          name: "Promoções",
          pluralName: "Promoções",
          imageUrl: group.promotionsImageUrl,
        }),
      );
      expect(idsOf(categoryGroup.categories[1].products)).toEqual(["p-1"]);
    });

    it("should omit 'Promoções' when no product of the group has a compareAtPrice", async () => {
      const group = buildCategoryGroup("g-1", [
        buildCategory("c-1", [
          buildProduct({ id: "p-1", stockQuantity: 50, sortOrder: 1 }),
        ]),
        buildCategory("c-2", [
          buildProduct({ id: "p-2", stockQuantity: 50, sortOrder: 2 }),
        ]),
      ]);
      prismaMock.categoryGroup.findMany.mockResolvedValue([group]);

      const [categoryGroup] = await service.findCatalog(anonymousSession);

      expect(idsOf(categoryGroup.categories)).toEqual(["Todos", "c-1", "c-2"]);
    });

    it("should return only 'Todos' when the group has a single non-empty category, even if it has promotions", async () => {
      const group = buildCategoryGroup("g-1", [
        buildCategory("c-1", [
          buildProduct({
            id: "p-1",
            stockQuantity: 50,
            sortOrder: 1,
            compareAtPrice: 2000,
          }),
        ]),
      ]);
      prismaMock.categoryGroup.findMany.mockResolvedValue([group]);

      const [categoryGroup] = await service.findCatalog(anonymousSession);

      expect(idsOf(categoryGroup.categories)).toEqual(["Todos"]);
      expect(idsOf(categoryGroup.categories[0].products)).toEqual(["p-1"]);
    });

    it("should order the products of 'Todos' by their group-scoped sortOrder, crossing category boundaries", async () => {
      const group = buildCategoryGroup("g-1", [
        buildCategory("c-1", [
          buildProduct({ id: "p-1", stockQuantity: 50, sortOrder: 1 }),
          buildProduct({ id: "p-3", stockQuantity: 50, sortOrder: 3 }),
        ]),
        buildCategory("c-2", [
          buildProduct({ id: "p-2", stockQuantity: 50, sortOrder: 2 }),
          buildProduct({ id: "p-4", stockQuantity: 50, sortOrder: 4 }),
        ]),
      ]);
      prismaMock.categoryGroup.findMany.mockResolvedValue([group]);

      const [categoryGroup] = await service.findCatalog(anonymousSession);

      expect(idsOf(categoryGroup.categories[0].products)).toEqual([
        "p-1",
        "p-2",
        "p-3",
        "p-4",
      ]);
    });

    it("should fall back to the id when two products share the same sortOrder", async () => {
      const group = buildCategoryGroup("g-1", [
        buildCategory("c-1", [
          buildProduct({ id: "p-b", stockQuantity: 50, sortOrder: 1 }),
        ]),
        buildCategory("c-2", [
          buildProduct({ id: "p-a", stockQuantity: 50, sortOrder: 1 }),
        ]),
      ]);
      prismaMock.categoryGroup.findMany.mockResolvedValue([group]);

      const [categoryGroup] = await service.findCatalog(anonymousSession);

      expect(idsOf(categoryGroup.categories[0].products)).toEqual([
        "p-a",
        "p-b",
      ]);
    });

    it("should omit categories without products", async () => {
      const group = buildCategoryGroup("g-1", [
        buildCategory("c-1", [
          buildProduct({ id: "p-1", stockQuantity: 50, sortOrder: 1 }),
        ]),
        buildCategory("c-empty", []),
        buildCategory("c-2", [
          buildProduct({ id: "p-2", stockQuantity: 50, sortOrder: 2 }),
        ]),
      ]);
      prismaMock.categoryGroup.findMany.mockResolvedValue([group]);

      const [categoryGroup] = await service.findCatalog(anonymousSession);

      expect(idsOf(categoryGroup.categories)).toEqual(["Todos", "c-1", "c-2"]);
    });

    it("should omit groups whose categories are all empty, without building pseudo-categories for them", async () => {
      const emptyGroup = buildCategoryGroup("g-empty", [
        buildCategory("c-empty", []),
      ]);
      const group = buildCategoryGroup("g-1", [
        buildCategory("c-1", [
          buildProduct({ id: "p-1", stockQuantity: 50, sortOrder: 1 }),
        ]),
      ]);
      prismaMock.categoryGroup.findMany.mockResolvedValue([emptyGroup, group]);

      const result = await service.findCatalog(anonymousSession);

      expect(idsOf(result)).toEqual(["g-1"]);
    });

    it("should omit groups without any category", async () => {
      prismaMock.categoryGroup.findMany.mockResolvedValue([
        buildCategoryGroup("g-empty", []),
      ]);

      await expect(service.findCatalog(anonymousSession)).resolves.toEqual([]);
    });

    it.each(
      sessionCases,
    )("should enrich each product with the quantity already in the cart of the $label", async ({
      session,
    }) => {
      const group = buildCategoryGroup("g-1", [
        buildCategory("c-1", [
          buildProduct({ id: "p-1", stockQuantity: 50, sortOrder: 1 }),
          buildProduct({ id: "p-2", stockQuantity: 50, sortOrder: 2 }),
        ]),
      ]);
      prismaMock.categoryGroup.findMany.mockResolvedValue([group]);
      mockCart([{ productId: "p-1", quantity: 4 }]);

      const [categoryGroup] = await service.findCatalog(session);
      const [first, second] = productsOf(categoryGroup.categories[0]);

      expect(first.quantityInCart).toBe(4);
      expect(second.quantityInCart).toBe(0);
    });

    it("should expose remainingStock only at or below the low-stock threshold", async () => {
      const group = buildCategoryGroup("g-1", [
        buildCategory("c-1", [
          buildProduct({ id: "p-1", stockQuantity: 3, sortOrder: 1 }),
          buildProduct({ id: "p-2", stockQuantity: 10, sortOrder: 2 }),
          buildProduct({ id: "p-3", stockQuantity: 11, sortOrder: 3 }),
        ]),
      ]);
      prismaMock.categoryGroup.findMany.mockResolvedValue([group]);

      const [categoryGroup] = await service.findCatalog(anonymousSession);
      const [low, threshold, plenty] = productsOf(categoryGroup.categories[0]);

      expect(low.remainingStock).toBe(3);
      expect(threshold.remainingStock).toBe(10);
      expect(plenty.remainingStock).toBeNull();
    });

    it("should degrade to an empty cart when the session owner is not found", async () => {
      const group = buildCategoryGroup("g-1", [
        buildCategory("c-1", [
          buildProduct({ id: "p-1", stockQuantity: 50, sortOrder: 1 }),
        ]),
      ]);
      prismaMock.categoryGroup.findMany.mockResolvedValue([group]);
      mockCart(null);

      const [categoryGroup] = await service.findCatalog(anonymousSession);

      expect(productsOf(categoryGroup.categories[0])[0].quantityInCart).toBe(0);
    });
  });

  describe("search", () => {
    it("should match the term against the product and its category, filtering out inactive and deleted records", async () => {
      await service.search(anonymousSession, { searchTerm: "cerveja" });

      const term = { contains: "cerveja", mode: "insensitive" };

      expect(prismaMock.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isActive: true,
            deletedAt: null,
            category: { isActive: true, categoryGroup: { isActive: true } },
            OR: [
              { name: term },
              { description: term },
              { category: { name: term } },
              { category: { pluralName: term } },
            ],
          },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        }),
      );
    });

    it("should return an empty array when nothing matches", async () => {
      prismaMock.product.findMany.mockResolvedValue([]);

      await expect(
        service.search(anonymousSession, { searchTerm: "cerveja" }),
      ).resolves.toEqual([]);
    });

    it("should return a flat list of enriched products", async () => {
      prismaMock.product.findMany.mockResolvedValue([
        buildProduct({ id: "p-1", stockQuantity: 3 }),
        buildProduct({ id: "p-2", stockQuantity: 11 }),
      ]);
      mockCart([{ productId: "p-1", quantity: 2 }]);

      const result = await service.search(anonymousSession, {
        searchTerm: "cerveja",
      });

      expect(result).toEqual([
        expect.objectContaining({
          id: "p-1",
          quantityInCart: 2,
          remainingStock: 3,
        }),
        expect.objectContaining({
          id: "p-2",
          quantityInCart: 0,
          remainingStock: null,
        }),
      ]);
    });

    it("should read the cart of the customer, not of a device, when the session is authenticated", async () => {
      await service.search(customerSession, { searchTerm: "cerveja" });

      expect(prismaMock.customer.findFirst).toHaveBeenCalled();
      expect(prismaMock.anonymousCustomer.findUnique).not.toHaveBeenCalled();
    });

    it("should degrade to an empty cart when the session owner is not found", async () => {
      prismaMock.product.findMany.mockResolvedValue([
        buildProduct({ id: "p-1", stockQuantity: 3 }),
      ]);
      mockCart(null);

      const result = await service.search(anonymousSession, {
        searchTerm: "cerveja",
      });

      expect(result[0].quantityInCart).toBe(0);
    });
  });

  describe("findAnonymousOrCustomerWithCart", () => {
    it("should query anonymous customer with cart items when deviceId is present in session", async () => {
      const findUniqueSpy = jest.spyOn(
        prismaMock.anonymousCustomer,
        "findUnique",
      );
      prismaMock.anonymousCustomer.findUnique.mockResolvedValue(null);

      await (service as any).findAnonymousOrCustomerWithCart({
        deviceId: "device-123",
      });

      expect(findUniqueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deviceId: "device-123" },
          select: {
            cart: {
              select: {
                items: {
                  select: { productId: true, quantity: true },
                },
              },
            },
          },
        }),
      );
    });

    it("should query customer with cart items when customerId is present in session", async () => {
      const findFirstSpy = jest.spyOn(prismaMock.customer, "findFirst");
      prismaMock.customer.findFirst.mockResolvedValue(null);

      await (service as any).findAnonymousOrCustomerWithCart(customerSession);

      expect(findFirstSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: customerSession.customerId },
          select: {
            cart: {
              select: {
                items: {
                  select: { productId: true, quantity: true },
                },
              },
            },
          },
        }),
      );
    });

    it("should query customer (not anonymous) when session has both deviceId and customerId", async () => {
      const findFirstSpy = jest.spyOn(prismaMock.customer, "findFirst");
      prismaMock.customer.findFirst.mockResolvedValue(null);
      const session = {
        deviceId: "device-123",
        customerId: "customer-123",
      };

      await (service as any).findAnonymousOrCustomerWithCart(session);

      expect(findFirstSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: session.customerId },
        }),
      );
      expect(prismaMock.anonymousCustomer.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("calculateQuantityInCart", () => {
    it("should return an empty object when items array is empty", () => {
      const result = (service as any).calculateQuantityInCart([]);

      expect(result).toEqual({});
    });

    it("should return the correct quantity for a single item", () => {
      const result = (service as any).calculateQuantityInCart([
        { productId: "product-1", quantity: 3 },
      ]);

      expect(result).toEqual({ "product-1": 3 });
    });

    it("should sum quantities for multiple items with the same productId", () => {
      const result = (service as any).calculateQuantityInCart([
        { productId: "product-1", quantity: 2 },
        { productId: "product-1", quantity: 5 },
      ]);

      expect(result).toEqual({ "product-1": 7 });
    });

    it("should handle multiple different products independently", () => {
      const result = (service as any).calculateQuantityInCart([
        { productId: "product-1", quantity: 2 },
        { productId: "product-2", quantity: 4 },
        { productId: "product-1", quantity: 1 },
      ]);

      expect(result).toEqual({ "product-1": 3, "product-2": 4 });
    });
  });
});
