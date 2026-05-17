import { Test, TestingModule } from "@nestjs/testing";
import { MeService } from "../me.service";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { prismaMock } from "@shared/testing/mocks";
import { AppException } from "@shared/exceptions/app.exception";
import { AddressFactory, CustomerFactory } from "@shared/testing/factories";

const customerId = "customer-uuid";

describe("MeService", () => {
  let service: MeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MeService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get<MeService>(MeService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("findMe", () => {
    it("should return the customer with addresses", async () => {
      const address = AddressFactory.createOne({ customerId });
      const customer = CustomerFactory.createOne({
        id: customerId,
        addresses: [address],
      });

      prismaMock.customer.findUnique.mockResolvedValue(customer);

      const result = await service.findMe(customerId);

      expect(result).toEqual(customer);
      expect(prismaMock.customer.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: customerId, isActive: true },
          include: { addresses: true },
        }),
      );
    });

    it("should throw CUSTOMER_NOT_FOUND when customer does not exist", async () => {
      prismaMock.customer.findUnique.mockResolvedValue(null);

      await expect(service.findMe(customerId)).rejects.toMatchObject({
        code: AppException.errorCodes.me.CUSTOMER_NOT_FOUND,
      });
    });
  });

  describe("updateMe", () => {
    it("should throw NO_FIELDS_TO_UPDATE when dto is empty", async () => {
      await expect(service.updateMe(customerId, {})).rejects.toMatchObject({
        code: AppException.errorCodes.me.NO_FIELDS_TO_UPDATE,
      });

      expect(prismaMock.customer.findUnique).not.toHaveBeenCalled();
    });

    it("should throw CUSTOMER_NOT_FOUND when customer does not exist", async () => {
      prismaMock.customer.findUnique.mockResolvedValue(null);

      await expect(
        service.updateMe(customerId, { name: "Maria Silva" }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.me.CUSTOMER_NOT_FOUND,
      });

      expect(prismaMock.customer.update).not.toHaveBeenCalled();
    });

    it("should update and return the customer when name is provided", async () => {
      const customer = CustomerFactory.createOne({ id: customerId });
      const updatedCustomer = CustomerFactory.createOne({
        id: customerId,
        name: "Maria Silva",
      });

      prismaMock.customer.findUnique.mockResolvedValue(customer);
      prismaMock.customer.update.mockResolvedValue(updatedCustomer);

      const result = await service.updateMe(customerId, {
        name: "Maria Silva",
      });

      expect(result).toEqual(updatedCustomer);
      expect(prismaMock.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: customerId },
          data: { name: "Maria Silva" },
        }),
      );
    });
  });

  describe("addAddress", () => {
    const dto = {
      zipCode: "12345678",
      neighborhood: "Bairro B",
      number: "123",
      street: "Rua A",
      complement: undefined,
    };

    it("should throw CUSTOMER_NOT_FOUND when customer does not exist", async () => {
      prismaMock.customer.findUnique.mockResolvedValue(null);

      await expect(service.addAddress(customerId, dto)).rejects.toMatchObject({
        code: AppException.errorCodes.me.CUSTOMER_NOT_FOUND,
      });
    });

    it("should throw ADDRESS_ALREADY_EXISTS when same zipCode and number exist", async () => {
      const existingAddress = AddressFactory.createOne({
        customerId,
        zipCode: dto.zipCode,
        number: dto.number,
      });
      const customer = CustomerFactory.createOne({
        id: customerId,
        addresses: [existingAddress],
      });

      prismaMock.customer.findUnique.mockResolvedValue(customer);

      await expect(service.addAddress(customerId, dto)).rejects.toMatchObject({
        code: AppException.errorCodes.me.ADDRESS_ALREADY_EXISTS,
      });
    });

    it("should demote existing main addresses and create new address as main", async () => {
      const existingAddress = AddressFactory.createOne({
        customerId,
        id: "old-address",
        zipCode: "99999999",
        number: "999",
      });
      const newAddress = AddressFactory.createOne({
        customerId,
        id: "new-address",
        isMain: true,
      });
      const customer = CustomerFactory.createOne({
        id: customerId,
        addresses: [existingAddress],
      });
      const updatedCustomer = CustomerFactory.createOne({
        id: customerId,
        addresses: [{ ...existingAddress, isMain: false }, newAddress],
      });

      prismaMock.customer.findUnique.mockResolvedValue(customer);
      prismaMock.customer.update.mockResolvedValue(updatedCustomer);

      const result = await service.addAddress(customerId, dto);

      expect(prismaMock.address.updateMany).toHaveBeenCalledWith({
        where: { customerId, isMain: true },
        data: { isMain: false },
      });
      expect(prismaMock.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: customerId },
          data: {
            addresses: {
              create: expect.objectContaining({
                zipCode: dto.zipCode,
                isMain: true,
              }),
            },
          },
        }),
      );
      expect(result).toEqual({ addresses: updatedCustomer.addresses });
    });
  });

  describe("removeAddress", () => {
    const addressId = "address-uuid";
    const dto = { addressId };

    it("should throw CUSTOMER_NOT_FOUND when customer does not exist", async () => {
      prismaMock.customer.findUnique.mockResolvedValue(null);

      await expect(
        service.removeAddress(customerId, dto),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.me.CUSTOMER_NOT_FOUND,
      });
    });

    it("should throw ADDRESS_NOT_FOUND when address is not in customer's list", async () => {
      const otherAddress = AddressFactory.createOne({
        customerId,
        id: "other-address",
      });
      const customer = CustomerFactory.createOne({
        id: customerId,
        addresses: [otherAddress],
      });

      prismaMock.customer.findUnique.mockResolvedValue(customer);

      await expect(
        service.removeAddress(customerId, { addressId: "non-existent" }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.me.ADDRESS_NOT_FOUND,
      });

      expect(prismaMock.customer.update).not.toHaveBeenCalled();
    });

    it("should remove address and return remaining addresses", async () => {
      const addressToRemove = AddressFactory.createOne({
        customerId,
        id: addressId,
      });
      const remainingAddress = AddressFactory.createOne({
        customerId,
        id: "other-address",
        isMain: false,
      });
      const customer = CustomerFactory.createOne({
        id: customerId,
        addresses: [addressToRemove, remainingAddress],
      });
      const updatedCustomer = CustomerFactory.createOne({
        id: customerId,
        addresses: [remainingAddress],
      });

      prismaMock.customer.findUnique.mockResolvedValue(customer);
      prismaMock.customer.update.mockResolvedValue(updatedCustomer);
      prismaMock.customer.update.mockResolvedValue(updatedCustomer);

      const result = await service.removeAddress(customerId, dto);

      expect(prismaMock.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: customerId },
          data: { addresses: { delete: { id: addressId } } },
        }),
      );
      expect(result).toEqual({ addresses: updatedCustomer.addresses });
    });
  });
});
