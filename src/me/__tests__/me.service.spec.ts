/** biome-ignore-all lint/complexity/useLiteralKeys: <private methods has to be accessed by this way> */
/** biome-ignore-all lint/suspicious/noExplicitAny: <some tests needs to use any> */
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
      const sortAddressesSpy = jest.spyOn(service as any, "sortAddresses");

      const address = AddressFactory.createOne({ customerId });
      const customer = CustomerFactory.createOne({
        id: customerId,
        addresses: [address],
      });

      prismaMock.customer.findUnique.mockResolvedValue(customer);

      const result = await service.findMe(customerId);

      expect(result).toEqual(customer);
      expect(sortAddressesSpy).toHaveBeenCalledWith(customer.addresses);
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

  describe("initMe", () => {
    const dto = {
      name: "Maria Silva",
      address: {
        zipCode: "12345678",
        neighborhood: "Bairro B",
        number: "123",
        street: "Rua A",
      },
    };

    it("should throw ALREADY_INITIALIZED when customer already has a name", async () => {
      const customer = CustomerFactory.createOne({
        id: customerId,
        name: "João da Silva",
      });

      prismaMock.customer.findUnique.mockResolvedValue(customer);

      await expect(service.initMe(customerId, dto)).rejects.toMatchObject({
        code: AppException.errorCodes.me.ALREADY_INITIALIZED,
        message: "Dados do cliente já inicializados",
      });
    });

    it("should initialize customer data and return updated customer when name is not set", async () => {
      const sortAddressesSpy = jest.spyOn(service as any, "sortAddresses");

      const customer = CustomerFactory.createOne({
        id: customerId,
        name: null,
        addresses: [],
      });

      prismaMock.customer.findUnique.mockResolvedValue(customer);
      prismaMock.customer.update.mockResolvedValue({
        ...customer,
        name: dto.name,
      });

      const result = await service.initMe(customerId, dto);

      expect(result).toEqual({
        ...customer,
        name: dto.name,
      });
      expect(sortAddressesSpy).toHaveBeenCalledWith(customer.addresses);
      expect(prismaMock.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: customerId },
          data: {
            name: dto.name,
            addresses: {
              create: {
                zipCode: dto.address.zipCode,
                neighborhood: dto.address.neighborhood,
                number: dto.address.number,
                street: dto.address.street,
                isMain: true,
              },
            },
          },
          include: { addresses: true },
        }),
      );
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
      const sortAddressesSpy = jest.spyOn(service as any, "sortAddresses");

      const customer = CustomerFactory.createOne({
        id: customerId,
        addresses: [],
      });

      prismaMock.customer.findUnique.mockResolvedValue(customer);
      prismaMock.customer.update.mockResolvedValue({
        ...customer,
        name: "Maria Silva",
      });

      const result = await service.updateMe(customerId, {
        name: "Maria Silva",
      });

      expect(result).toEqual({
        ...customer,
        name: "Maria Silva",
      });
      expect(sortAddressesSpy).toHaveBeenCalledWith(customer.addresses);
      expect(prismaMock.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: customerId },
          data: { name: "Maria Silva" },
        }),
      );
    });
  });

  describe("deleteMe", () => {
    it("should delete the customer when it exists", async () => {
      const customer = CustomerFactory.createOne({ id: customerId });

      prismaMock.customer.findUnique.mockResolvedValue(customer);

      await expect(service.deleteMe(customerId)).resolves.toBeUndefined();
    });

    it("should throw CUSTOMER_NOT_FOUND when customer does not exist", async () => {
      prismaMock.customer.findUnique.mockResolvedValue(null);

      await expect(service.deleteMe(customerId)).rejects.toMatchObject({
        code: AppException.errorCodes.me.CUSTOMER_NOT_FOUND,
        httpStatus: AppException.HttpStatus.NOT_FOUND,
      });

      expect(prismaMock.customer.delete).not.toHaveBeenCalled();
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

    it("should throw LIMITED_NUMBER_OF_ADDRESSES when customer already has 3 addresses", async () => {
      const addresses = AddressFactory.createMany(3, { customerId });
      const customer = CustomerFactory.createOne({
        id: customerId,
        addresses,
      });

      prismaMock.customer.findUnique.mockResolvedValue(customer);

      await expect(service.addAddress(customerId, dto)).rejects.toMatchObject({
        code: AppException.errorCodes.me.LIMITED_NUMBER_OF_ADDRESSES,
        message: "Limite de endereços atingido.",
      });
    });

    it("should demote existing main addresses and create new address as main", async () => {
      const sortAddressesSpy = jest.spyOn(service as any, "sortAddresses");

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

      expect(sortAddressesSpy).toHaveBeenCalledWith(updatedCustomer.addresses);
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

    it("should throw CANNOT_REMOVE_MAIN_ADDRESS when customer has only one address", async () => {
      const address = AddressFactory.createOne({
        customerId,
        id: addressId,
        isMain: true,
      });
      const customer = CustomerFactory.createOne({
        id: customerId,
        addresses: [address],
      });

      prismaMock.customer.findUnique.mockResolvedValue(customer);

      await expect(
        service.removeAddress(customerId, dto),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.me.CANNOT_REMOVE_MAIN_ADDRESS,
        message: "Não é possível remover o único endereço cadastrado.",
      });

      expect(prismaMock.customer.update).not.toHaveBeenCalled();
    });

    it("should remove a non-main address and return remaining addresses", async () => {
      const sortAddressesSpy = jest.spyOn(service as any, "sortAddresses");

      const addressToRemove = AddressFactory.createOne({
        customerId,
        id: addressId,
        isMain: false,
      });
      const remainingAddress = AddressFactory.createOne({
        customerId,
        id: "other-address",
        isMain: true,
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

      const result = await service.removeAddress(customerId, dto);

      expect(sortAddressesSpy).toHaveBeenCalledWith(updatedCustomer.addresses);
      expect(prismaMock.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: customerId },
          data: { addresses: { delete: { id: addressId } } },
        }),
      );
      expect(result).toEqual({ addresses: updatedCustomer.addresses });
    });

    it("should remove the main address and promote the next address to main", async () => {
      const sortAddressesSpy = jest.spyOn(service as any, "sortAddresses");

      const addressToRemove = AddressFactory.createOne({
        customerId,
        id: addressId,
        isMain: true,
      });
      const nextAddress = AddressFactory.createOne({
        customerId,
        id: "other-address",
        isMain: false,
      });
      const customer = CustomerFactory.createOne({
        id: customerId,
        addresses: [addressToRemove, nextAddress],
      });
      const updatedCustomer = CustomerFactory.createOne({
        id: customerId,
        addresses: [{ ...nextAddress, isMain: true }],
      });

      prismaMock.customer.findUnique.mockResolvedValue(customer);
      prismaMock.customer.update.mockResolvedValue(updatedCustomer);

      const result = await service.removeAddress(customerId, dto);

      expect(sortAddressesSpy).toHaveBeenCalledWith(updatedCustomer.addresses);
      expect(prismaMock.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: customerId },
          data: {
            addresses: {
              delete: { id: addressId },
              update: {
                where: { id: nextAddress.id },
                data: { isMain: true },
              },
            },
          },
        }),
      );
      expect(result).toEqual({ addresses: updatedCustomer.addresses });
    });
  });

  describe("sortAddresses", () => {
    it("should sort addresses with main address first", () => {
      const addresses = AddressFactory.createMany(3, {
        customerId,
        isMain: false,
      });

      addresses[2].isMain = true;

      const sorted = service["sortAddresses"](addresses);

      expect(sorted[0].isMain).toBe(true);
      expect(sorted[1].isMain).toBe(false);
      expect(sorted[2].isMain).toBe(false);
    });
  });
});
