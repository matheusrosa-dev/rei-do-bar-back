/** biome-ignore-all lint/complexity/useLiteralKeys: <private methods has to be accessed by this way> */
/** biome-ignore-all lint/suspicious/noExplicitAny: <some tests needs to use any> */
import { Test, TestingModule } from "@nestjs/testing";
import { MeService } from "../me.service";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { prismaMock } from "@shared/testing/mocks";
import { AppException } from "@shared/exceptions/app.exception";
import { AddressFactory, CustomerFactory } from "@shared/testing/factories";
import { OrderStatus } from "@shared/database/prisma/generated/enums";

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
    it("should return the customer with addresses sorted with the main one first", async () => {
      const sortAddressesSpy = jest.spyOn(service as any, "sortAddresses");

      const mainAddress = AddressFactory.createOne({
        customerId,
        id: "main-address",
        isMain: true,
      });
      const otherAddress = AddressFactory.createOne({
        customerId,
        id: "other-address",
        isMain: false,
      });
      const customer = CustomerFactory.createOne({
        id: customerId,
        addresses: [otherAddress, mainAddress],
      });

      prismaMock.customer.findFirst.mockResolvedValue(customer);

      const result = await service.findMe(customerId);

      expect(result.addresses.map((a) => a.id)).toEqual([
        mainAddress.id,
        otherAddress.id,
      ]);
      expect(sortAddressesSpy).toHaveBeenCalledWith(customer.addresses);
      expect(prismaMock.customer.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: customerId, deletedAt: null },
          include: { addresses: true },
        }),
      );
    });

    it("should throw CUSTOMER_NOT_FOUND when customer does not exist", async () => {
      prismaMock.customer.findFirst.mockResolvedValue(null);

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

      prismaMock.customer.findFirst.mockResolvedValue(customer);

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

      prismaMock.customer.findFirst.mockResolvedValue(customer);
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

      expect(prismaMock.customer.findFirst).not.toHaveBeenCalled();
    });

    it("should throw CUSTOMER_NOT_FOUND when customer does not exist", async () => {
      prismaMock.customer.findFirst.mockResolvedValue(null);

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

      prismaMock.customer.findFirst.mockResolvedValue(customer);
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
    it("should anonymize the customer and remove its PII while keeping orders", async () => {
      const customer = CustomerFactory.createOne({ id: customerId });

      prismaMock.customer.findFirst.mockResolvedValue(customer);
      prismaMock.order.count.mockResolvedValue(0);

      await expect(service.deleteMe(customerId)).resolves.toBeUndefined();

      expect(prismaMock.address.deleteMany).toHaveBeenCalledWith({
        where: { customerId },
      });
      expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { customerId },
      });
      expect(prismaMock.pushToken.deleteMany).toHaveBeenCalledWith({
        where: { customerId },
      });
      expect(prismaMock.cart.deleteMany).toHaveBeenCalledWith({
        where: { customerId },
      });

      expect(prismaMock.customer.update).toHaveBeenCalledWith({
        where: { id: customerId },
        data: {
          name: null,
          phone: `deleted:${customerId}`,
          isActive: false,
          deletedAt: expect.any(Date),
        },
      });
      expect(prismaMock.$transaction).toHaveBeenCalled();
    });

    it("should throw CUSTOMER_NOT_FOUND when customer does not exist", async () => {
      prismaMock.customer.findFirst.mockResolvedValue(null);

      await expect(service.deleteMe(customerId)).rejects.toMatchObject({
        code: AppException.errorCodes.me.CUSTOMER_NOT_FOUND,
        httpStatus: AppException.HttpStatus.NOT_FOUND,
      });

      expect(prismaMock.customer.update).not.toHaveBeenCalled();
    });

    it("should throw CANNOT_DELETE_WITH_ACTIVE_ORDER when the customer has an order in progress", async () => {
      const customer = CustomerFactory.createOne({ id: customerId });

      prismaMock.customer.findFirst.mockResolvedValue(customer);
      prismaMock.order.count.mockResolvedValue(1);

      await expect(service.deleteMe(customerId)).rejects.toMatchObject({
        code: AppException.errorCodes.me.CANNOT_DELETE_WITH_ACTIVE_ORDER,
        httpStatus: AppException.HttpStatus.CONFLICT,
      });

      expect(prismaMock.order.count).toHaveBeenCalledWith({
        where: {
          customerId,
          status: {
            in: [
              OrderStatus.PENDING,
              OrderStatus.PREPARING,
              OrderStatus.SHIPPED,
            ],
          },
        },
      });
      expect(prismaMock.customer.update).not.toHaveBeenCalled();
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
      prismaMock.customer.findFirst.mockResolvedValue(null);

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

      prismaMock.customer.findFirst.mockResolvedValue(customer);
      prismaMock.address.findFirst.mockResolvedValue(existingAddress);

      await expect(service.addAddress(customerId, dto)).rejects.toMatchObject({
        code: AppException.errorCodes.me.ADDRESS_ALREADY_EXISTS,
      });

      expect(prismaMock.customer.update).not.toHaveBeenCalled();
    });

    it("should throw LIMITED_NUMBER_OF_ADDRESSES when customer already has 3 addresses", async () => {
      const addresses = AddressFactory.createMany(3, { customerId });
      const customer = CustomerFactory.createOne({
        id: customerId,
        addresses,
      });

      prismaMock.customer.findFirst.mockResolvedValue(customer);
      prismaMock.address.findFirst.mockResolvedValue(null);
      prismaMock.address.count.mockResolvedValue(3);

      await expect(service.addAddress(customerId, dto)).rejects.toMatchObject({
        code: AppException.errorCodes.me.LIMITED_NUMBER_OF_ADDRESSES,
        message: "Limite de endereços atingido.",
      });

      expect(prismaMock.customer.update).not.toHaveBeenCalled();
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

      prismaMock.customer.findFirst.mockResolvedValue(customer);
      prismaMock.address.findFirst.mockResolvedValue(null);
      prismaMock.address.count.mockResolvedValue(1);
      prismaMock.customer.update.mockResolvedValue(updatedCustomer);

      const result = await service.addAddress(customerId, dto);

      expect(sortAddressesSpy).toHaveBeenCalledWith(updatedCustomer.addresses);
      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(prismaMock.$queryRaw).toHaveBeenCalled();
      expect(prismaMock.address.findFirst).toHaveBeenCalledWith({
        where: {
          customerId,
          zipCode: dto.zipCode,
          number: dto.number,
        },
      });
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
      expect(result.addresses.map((a) => a.id)).toEqual([
        newAddress.id,
        existingAddress.id,
      ]);
    });

    it("should create the address with all provided fields, including complement", async () => {
      const dtoWithComplement = { ...dto, complement: "Apto 2" };

      const customer = CustomerFactory.createOne({
        id: customerId,
        addresses: [],
      });
      const createdAddress = AddressFactory.createOne({
        customerId,
        ...dtoWithComplement,
        isMain: true,
      });
      const updatedCustomer = CustomerFactory.createOne({
        id: customerId,
        addresses: [createdAddress],
      });

      prismaMock.customer.findFirst.mockResolvedValue(customer);
      prismaMock.address.findFirst.mockResolvedValue(null);
      prismaMock.address.count.mockResolvedValue(0);
      prismaMock.customer.update.mockResolvedValue(updatedCustomer);

      await service.addAddress(customerId, dtoWithComplement);

      expect(prismaMock.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            addresses: {
              create: {
                zipCode: dtoWithComplement.zipCode,
                neighborhood: dtoWithComplement.neighborhood,
                number: dtoWithComplement.number,
                street: dtoWithComplement.street,
                complement: dtoWithComplement.complement,
                isMain: true,
              },
            },
          },
        }),
      );
    });
  });

  describe("setMainAddress", () => {
    const addressId = "address-uuid";
    const dto = { addressId };

    it("should throw CUSTOMER_NOT_FOUND when customer does not exist", async () => {
      prismaMock.customer.findFirst.mockResolvedValue(null);

      await expect(
        service.setMainAddress(customerId, dto),
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

      prismaMock.customer.findFirst.mockResolvedValue(customer);

      await expect(
        service.setMainAddress(customerId, { addressId: "non-existent" }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.me.ADDRESS_NOT_FOUND,
      });

      expect(prismaMock.customer.update).not.toHaveBeenCalled();
    });

    it("should throw ADDRESS_ALREADY_MAIN when address is already the main address", async () => {
      const address = AddressFactory.createOne({
        customerId,
        id: addressId,
        isMain: true,
      });
      const customer = CustomerFactory.createOne({
        id: customerId,
        addresses: [address],
      });

      prismaMock.customer.findFirst.mockResolvedValue(customer);

      await expect(
        service.setMainAddress(customerId, dto),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.me.ADDRESS_ALREADY_MAIN,
        message: "Endereço já é o principal",
      });

      expect(prismaMock.customer.update).not.toHaveBeenCalled();
    });

    it("should demote current main address, promote the given address, and return addresses", async () => {
      const sortAddressesSpy = jest.spyOn(service as any, "sortAddresses");

      const currentMain = AddressFactory.createOne({
        customerId,
        id: "current-main",
        isMain: true,
      });
      const targetAddress = AddressFactory.createOne({
        customerId,
        id: addressId,
        isMain: false,
      });
      const customer = CustomerFactory.createOne({
        id: customerId,
        addresses: [currentMain, targetAddress],
      });
      const updatedCustomer = CustomerFactory.createOne({
        id: customerId,
        addresses: [
          { ...currentMain, isMain: false },
          { ...targetAddress, isMain: true },
        ],
      });

      prismaMock.customer.findFirst.mockResolvedValue(customer);
      prismaMock.customer.update.mockResolvedValue(updatedCustomer);

      const result = await service.setMainAddress(customerId, dto);

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
              update: {
                where: { id: addressId },
                data: { isMain: true },
              },
            },
          },
          include: { addresses: true },
        }),
      );
      expect(result.addresses.map((a) => a.id)).toEqual([
        targetAddress.id,
        currentMain.id,
      ]);
    });
  });

  describe("updateAddress", () => {
    const addressId = "address-uuid";
    const dto = {
      zipCode: "87654321",
      neighborhood: "Bairro Novo",
      number: "456",
      street: "Rua Nova",
      complement: "Apto 1",
    };

    it("should throw CUSTOMER_NOT_FOUND when customer does not exist", async () => {
      prismaMock.customer.findFirst.mockResolvedValue(null);

      await expect(
        service.updateAddress(customerId, addressId, dto),
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

      prismaMock.customer.findFirst.mockResolvedValue(customer);

      await expect(
        service.updateAddress(customerId, "non-existent", dto),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.me.ADDRESS_NOT_FOUND,
      });

      expect(prismaMock.customer.update).not.toHaveBeenCalled();
    });

    it("should throw ADDRESS_ALREADY_EXISTS when another address with same zipCode and number exists", async () => {
      const addressToUpdate = AddressFactory.createOne({
        customerId,
        id: addressId,
        zipCode: "11111111",
        number: "100",
      });
      const conflictingAddress = AddressFactory.createOne({
        customerId,
        id: "other-address",
        zipCode: dto.zipCode,
        number: dto.number,
      });
      const customer = CustomerFactory.createOne({
        id: customerId,
        addresses: [addressToUpdate, conflictingAddress],
      });

      prismaMock.customer.findFirst.mockResolvedValue(customer);

      await expect(
        service.updateAddress(customerId, addressId, dto),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.me.ADDRESS_ALREADY_EXISTS,
      });

      expect(prismaMock.customer.update).not.toHaveBeenCalled();
    });

    it("should update address with all provided fields and return addresses sorted with main first", async () => {
      const sortAddressesSpy = jest.spyOn(service as any, "sortAddresses");

      const addressToUpdate = AddressFactory.createOne({
        customerId,
        id: addressId,
        zipCode: "11111111",
        number: "100",
        isMain: false,
      });
      const mainAddress = AddressFactory.createOne({
        customerId,
        id: "main-address",
        zipCode: "22222222",
        number: "200",
        isMain: true,
      });
      const customer = CustomerFactory.createOne({
        id: customerId,
        addresses: [addressToUpdate, mainAddress],
      });
      const updatedCustomer = CustomerFactory.createOne({
        id: customerId,
        addresses: [{ ...addressToUpdate, ...dto }, mainAddress],
      });

      prismaMock.customer.findFirst.mockResolvedValue(customer);
      prismaMock.customer.update.mockResolvedValue(updatedCustomer);

      const result = await service.updateAddress(customerId, addressId, dto);

      expect(sortAddressesSpy).toHaveBeenCalledWith(updatedCustomer.addresses);
      expect(prismaMock.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: customerId },
          data: {
            addresses: {
              update: {
                where: { id: addressId },
                data: {
                  zipCode: dto.zipCode,
                  neighborhood: dto.neighborhood,
                  number: dto.number,
                  street: dto.street,
                  complement: dto.complement,
                },
              },
            },
          },
          include: { addresses: true },
        }),
      );
      expect(result.addresses.map((a) => a.id)).toEqual([
        mainAddress.id,
        addressId,
      ]);
    });

    it("should allow re-saving the same address with unchanged zipCode and number", async () => {
      const addressToUpdate = AddressFactory.createOne({
        customerId,
        id: addressId,
        zipCode: dto.zipCode,
        number: dto.number,
      });
      const customer = CustomerFactory.createOne({
        id: customerId,
        addresses: [addressToUpdate],
      });
      const updatedCustomer = CustomerFactory.createOne({
        id: customerId,
        addresses: [{ ...addressToUpdate, ...dto }],
      });

      prismaMock.customer.findFirst.mockResolvedValue(customer);
      prismaMock.customer.update.mockResolvedValue(updatedCustomer);

      await expect(
        service.updateAddress(customerId, addressId, dto),
      ).resolves.toEqual({ addresses: updatedCustomer.addresses });

      expect(prismaMock.customer.update).toHaveBeenCalled();
    });

    it("should set complement to null when not provided", async () => {
      const dtoWithoutComplement = {
        zipCode: "87654321",
        neighborhood: "Bairro Novo",
        number: "456",
        street: "Rua Nova",
      };

      const addressToUpdate = AddressFactory.createOne({
        customerId,
        id: addressId,
        complement: "Apto 10",
      });
      const customer = CustomerFactory.createOne({
        id: customerId,
        addresses: [addressToUpdate],
      });
      const updatedCustomer = CustomerFactory.createOne({
        id: customerId,
        addresses: [
          { ...addressToUpdate, ...dtoWithoutComplement, complement: null },
        ],
      });

      prismaMock.customer.findFirst.mockResolvedValue(customer);
      prismaMock.customer.update.mockResolvedValue(updatedCustomer);

      await service.updateAddress(customerId, addressId, dtoWithoutComplement);

      expect(prismaMock.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            addresses: {
              update: {
                where: { id: addressId },
                data: expect.objectContaining({ complement: null }),
              },
            },
          },
        }),
      );
    });
  });

  describe("removeAddress", () => {
    const addressId = "address-uuid";
    const dto = { addressId };

    it("should throw CUSTOMER_NOT_FOUND when customer does not exist", async () => {
      prismaMock.customer.findFirst.mockResolvedValue(null);

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

      prismaMock.customer.findFirst.mockResolvedValue(customer);

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

      prismaMock.customer.findFirst.mockResolvedValue(customer);

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

      prismaMock.customer.findFirst.mockResolvedValue(customer);
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

    it("should remove the main address and promote the first remaining address to main", async () => {
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
      const thirdAddress = AddressFactory.createOne({
        customerId,
        id: "third-address",
        isMain: false,
      });
      const customer = CustomerFactory.createOne({
        id: customerId,
        addresses: [addressToRemove, nextAddress, thirdAddress],
      });
      const updatedCustomer = CustomerFactory.createOne({
        id: customerId,
        addresses: [thirdAddress, { ...nextAddress, isMain: true }],
      });

      prismaMock.customer.findFirst.mockResolvedValue(customer);
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
      expect(result.addresses.map((a) => a.id)).toEqual([
        nextAddress.id,
        thirdAddress.id,
      ]);
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
