import { ExecutionContext } from "@nestjs/common";
import { ICurrentDeliveryPerson } from "@shared/types/delivery-person";

jest.mock("@nestjs/common", () => ({
  ...jest.requireActual("@nestjs/common"),
  createParamDecorator: (fn: Function) => fn,
}));

// Import after the mock so createParamDecorator returns the factory fn directly
// eslint-disable-next-line import/first
import { CurrentDeliveryPerson } from "../current-delivery-person.decorator";

type DecoratorFactory = (
  _data: unknown,
  ctx: ExecutionContext,
) => ICurrentDeliveryPerson;

const factory = CurrentDeliveryPerson as unknown as DecoratorFactory;

const makeContext = (deliveryPerson?: ICurrentDeliveryPerson) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ deliveryPerson }),
    }),
  }) as unknown as ExecutionContext;

describe("CurrentDeliveryPerson", () => {
  it("should return the delivery person the access-token guard placed on the request", () => {
    const context = makeContext({ id: "delivery-person-id" });

    expect(factory(undefined, context)).toEqual({ id: "delivery-person-id" });
  });

  it("should return undefined when the guard did not run", () => {
    const context = makeContext(undefined);

    expect(factory(undefined, context)).toBeUndefined();
  });
});
