import { ExecutionContext, createParamDecorator } from "@nestjs/common";

export interface ICurrentSession {
  deviceId: string;
}

export const CurrentSession = createParamDecorator(
  (_data, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest();

    const deviceId = request.headers["x-device-id"];

    return { deviceId } as ICurrentSession;
  },
);
