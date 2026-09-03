import { DeliveryPersonFactory } from "../delivery-person.factory";

describe("DeliveryPersonFactory", () => {
  describe("createOne", () => {
    it("should create a delivery person with default values", () => {
      const deliveryPerson = DeliveryPersonFactory.createOne();

      expect(deliveryPerson.id).toEqual(expect.any(String));
      expect(deliveryPerson.name).toEqual(expect.any(String));
      expect(deliveryPerson.phone).toMatch(/^\d{11}$/);
      expect(deliveryPerson.cpf).toMatch(/^\d{11}$/);
      expect(deliveryPerson.addressZipCode).toMatch(/^\d{8}$/);
      expect(deliveryPerson.isActive).toBe(true);
      expect(deliveryPerson.isVolunteer).toBe(false);
      expect(deliveryPerson.createdAt).toBeInstanceOf(Date);
      expect(deliveryPerson.updatedAt).toBeInstanceOf(Date);
    });

    it("should default to no password, matching a delivery person who cannot log in yet", () => {
      const deliveryPerson = DeliveryPersonFactory.createOne();

      expect(deliveryPerson.hashedPassword).toBeNull();
    });

    it("should use provided values when all props are given", () => {
      const props = {
        id: "delivery-person-id",
        name: "João da Silva",
        phone: "11999999999",
        cpf: "12345678901",
        hashedPassword: "hashed-password",
        addressStreet: "Rua A",
        addressNumber: "10",
        addressNeighborhood: "Centro",
        addressZipCode: "01001000",
        isActive: false,
        isVolunteer: true,
      };

      expect(DeliveryPersonFactory.createOne(props)).toMatchObject(props);
    });
  });

  describe("createMany", () => {
    it("should create the specified number of delivery persons", () => {
      expect(DeliveryPersonFactory.createMany(3)).toHaveLength(3);
    });

    it("should create independent instances", () => {
      const [first, second] = DeliveryPersonFactory.createMany(2);

      expect(first.id).not.toBe(second.id);
    });

    it("should apply provided props to all created delivery persons", () => {
      const deliveryPersons = DeliveryPersonFactory.createMany(2, {
        isActive: false,
      });

      expect(deliveryPersons.every(({ isActive }) => isActive === false)).toBe(
        true,
      );
    });
  });
});
