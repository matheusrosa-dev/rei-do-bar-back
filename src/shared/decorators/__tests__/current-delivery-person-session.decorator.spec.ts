import { ExecutionContext } from "@nestjs/common";
import { ICurrentDeliveryPersonSession } from "@shared/types/delivery-person";

jest.mock("@nestjs/common", () => ({
  ...jest.requireActual("@nestjs/common"),
  createParamDecorator: (fn: Function) => fn,
}));

// Import after the mock so createParamDecorator returns the factory fn directly
// eslint-disable-next-line import/first
import { CurrentDeliveryPersonSession } from "../current-delivery-person-session.decorator";

type DecoratorFactory = (
  _data: unknown,
  ctx: ExecutionContext,
) => ICurrentDeliveryPersonSession;

const factory = CurrentDeliveryPersonSession as unknown as DecoratorFactory;

const makeContext = (deliveryPersonSession?: ICurrentDeliveryPersonSession) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ deliveryPersonSession }),
    }),
  }) as unknown as ExecutionContext;

describe("CurrentDeliveryPersonSession", () => {
  it("should return the session the refresh-token guard placed on the request", () => {
    const session = {
      id: "session-id",
      hashedRefreshToken: "hashed-refresh-token",
    };
    const context = makeContext(session);

    expect(factory(undefined, context)).toEqual(session);
  });

  it("should return undefined when the guard did not run", () => {
    const context = makeContext(undefined);

    expect(factory(undefined, context)).toBeUndefined();
  });
});
