import { Test, TestingModule } from "@nestjs/testing";
import { CustomersService } from "../customers.service";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { prismaMock } from "@shared/testing/mocks";
import { CartFactory, CustomerFactory } from "@shared/testing/factories";

describe("CustomersService", () => {
  let service: CustomersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<CustomersService>(CustomersService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("createCustomerFromAnonymous", () => {
    const createdCustomer = CustomerFactory.createOne({
      cart: CartFactory.createOne({ items: [] }),
    });

    const input = {
      newCustomer: { phone: "11999999999" },
      anonymousCustomer: { cartId: "cart-123", id: "anon-123" },
    };

    beforeEach(() => {
      prismaMock.customer.create.mockResolvedValue(createdCustomer);
      prismaMock.cart.update.mockResolvedValue({});
      prismaMock.anonymousCustomer.delete.mockResolvedValue({});
    });

    it("should run inside a transaction", async () => {
      await service.createCustomerFromAnonymous(input);

      expect(prismaMock.$transaction).toHaveBeenCalled();
    });

    it("should create a customer with the given phone and isActive=true", async () => {
      await service.createCustomerFromAnonymous(input);

      expect(prismaMock.customer.create).toHaveBeenCalledWith({
        data: {
          phone: input.newCustomer.phone,
          isActive: true,
        },
      });
    });

    it("should assign the anonymous cart to the new customer", async () => {
      await service.createCustomerFromAnonymous(input);

      expect(prismaMock.cart.update).toHaveBeenCalledWith({
        where: { id: input.anonymousCustomer.cartId },
        data: {
          anonymousCustomerId: null,
          customerId: createdCustomer.id,
        },
      });
    });

    it("should delete the anonymous customer", async () => {
      await service.createCustomerFromAnonymous(input);

      expect(prismaMock.anonymousCustomer.delete).toHaveBeenCalledWith({
        where: { id: input.anonymousCustomer.id },
      });
    });

    it("should return the created customer", async () => {
      const result = await service.createCustomerFromAnonymous(input);

      expect(result).toEqual(createdCustomer);
    });
  });
});
