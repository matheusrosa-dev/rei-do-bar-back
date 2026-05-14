import { ExecutionContext, createParamDecorator } from "@nestjs/common";

export interface ICurrentSession {
  deviceId: string;
  customerId?: string;
  phone?: string;
  token?: string;
}

export const CurrentSession = createParamDecorator(
  (_data, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest();

    const deviceId = request.headers["x-device-id"];
    const token = request.headers?.authorization?.split(" ")[1];

    if (request?.user) {
      return {
        deviceId,
        customerId: request.user.customerId,
        phone: request.user.phone,
        token,
      } as ICurrentSession;
    }

    return { deviceId } as ICurrentSession;
  },
);
