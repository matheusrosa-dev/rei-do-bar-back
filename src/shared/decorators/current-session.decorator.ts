import { ExecutionContext, createParamDecorator } from "@nestjs/common";
import { AppException } from "@shared/exceptions/app.exception";
import { ICurrentSession } from "@shared/types/jwt";
import { Request } from "express";
import jwt from "jsonwebtoken";

export const CurrentSession = createParamDecorator(
  (_data, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest() as Request;

    const deviceId = request.headers["x-device-id"] as string;
    const authHeader = request.headers?.authorization;

    const token = authHeader?.split(" ")[1];

    const isRefreshTokenRoute =
      request.url === "/auth/refresh" && request.method === "POST";

    const user = {} as ICurrentSession;

    // Se não houver token, mas houver deviceId, consideramos como sessão anônima
    if (!token) {
      user.deviceId = deviceId;
      return user;
    }

    // Se for rota de refresh token, o token precisa ser passado para o controller
    if (isRefreshTokenRoute) {
      user.token = token;
    }

    // Se o controller usa o guard de autenticação, o user já deve estar presente no request, então extraímos os dados de lá
    if (request?.user) {
      user.customerId = request.user.customerId;
      user.phone = request.user.phone;
    } else {
      // Caso contrário, tentamos verificar o token aqui para extrair os dados do usuário
      try {
        const payload = jwt.verify(
          token,
          process.env.AUTH_JWT_SECRET!,
        ) as jwt.JwtPayload;

        user.customerId = payload.customerId;
        user.phone = payload.phone;
      } catch {
        throw new AppException(
          AppException.errorCodes.auth.INVALID_TOKEN_IN_DECORATOR,
          "Unauthorized",
          AppException.HttpStatus.UNAUTHORIZED,
        );
      }
    }

    return user;
  },
);
