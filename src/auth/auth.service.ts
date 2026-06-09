import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { randomUUID } from "node:crypto";
import { LoginOtpCodeDto, SyncDeviceIdDto, SendOtpCodeDto } from "./dtos";
import { AppException } from "@shared/exceptions/app.exception";
import {
  AnonymousCustomer,
  Cart,
  Customer,
  Prisma,
} from "@shared/database/prisma/generated/client";
import { ConfigService } from "@nestjs/config";
import { IAuthConfig } from "@shared/config/env-config.interface";
import jwt from "jsonwebtoken";
import { hashString } from "@shared/helpers/string";
import { generateOtpCode } from "@shared/helpers/otp-code";
import { CustomersService } from "../customers/customers.service";

@Injectable()
export class AuthService {
  private readonly authConfig: IAuthConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly customersService: CustomersService,
    configService: ConfigService,
  ) {
    this.authConfig = configService.get<IAuthConfig>("auth")!;
  }

  async syncDeviceId(dto: SyncDeviceIdDto) {
    let deviceId = dto?.deviceId;

    console.log(deviceId);

    if (!deviceId) {
      deviceId = randomUUID();
    }

    const anonymousCustomer = await this.findAnonymousCustomer(deviceId);

    if (!anonymousCustomer) {
      await this.prisma.anonymousCustomer.create({
        data: {
          deviceId,
          cart: {
            create: {},
          },
        },
      });
    }

    return {
      deviceId,
    };
  }

  async sendOtpCode(deviceId: string, _dto: SendOtpCodeDto) {
    const anonymousCustomer = (await this.findAnonymousCustomer(deviceId, {
      throwIfNotFound: true,
    }))!;

    const { code, hashedCode } = generateOtpCode();

    await this.prisma.$transaction(async (tx) => {
      // Remove todos os códigos antigos associados a esse cliente anônimo
      await tx.otpCode.deleteMany({
        where: {
          anonymousCustomerId: anonymousCustomer.id,
        },
      });

      const { otpExpirationMinutes } = this.authConfig;

      // Cria um novo código de verificação
      await tx.otpCode.create({
        data: {
          hashedCode,
          anonymousCustomerId: anonymousCustomer.id,
          expiresAt: new Date(Date.now() + otpExpirationMinutes * 60 * 1000),
        },
      });
    });

    //TODO: INTEGRAR COM SERVIÇO DE ENVIO DE SMS
    console.log(`Código de verificação: ${code}`);
  }

  async loginWithOtpCode(deviceId: string, dto: LoginOtpCodeDto) {
    const anonymousCustomer = (await this.findAnonymousCustomer(deviceId, {
      throwIfNotFound: true,
      includeCart: true,
    }))!;

    await this.validateOtpCode({
      anonymousCustomerId: anonymousCustomer.id,
      code: dto.code,
    });

    // Verifica se já existe um cliente associado a esse número de telefone
    let customer = await this.prisma.customer.findUnique({
      where: {
        phone: dto.phone,
      },
    });

    if (!customer) {
      customer = await this.createCustomerOrRecoverOnConflict(
        dto.phone,
        anonymousCustomer,
      );
    }

    const tokens = this.generateTokens({
      customerId: customer.id,
      phone: customer.phone,
    });

    await this.prisma.refreshToken.create({
      data: {
        hashedToken: tokens.hashedRefreshToken,
        customerId: customer.id,
      },
    });

    return {
      hasToInitAccount: !customer.name,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async refreshTokens(data: { customerId: string; token: string }) {
    const validToken = await this.prisma.refreshToken.findUnique({
      where: {
        hashedToken: hashString(data.token),
      },
      include: {
        customer: {
          select: { id: true, phone: true },
        },
      },
    });

    if (!validToken || validToken.customerId !== data.customerId) {
      throw new AppException(
        AppException.errorCodes.auth.INVALID_REFRESH_TOKEN,
        "Acesso negado. O token de atualização fornecido é inválido.",
        AppException.HttpStatus.UNAUTHORIZED,
      );
    }

    const newTokens = this.generateTokens({
      customerId: validToken.customer.id,
      phone: validToken.customer.phone,
    });

    await this.prisma.$transaction(async (tx) => {
      // Remove o refresh token antigo de forma atômica para evitar reuso. Em
      // rotações concorrentes com o mesmo token, apenas uma requisição deleta a
      // linha (count 1); as demais recebem count 0 e têm o acesso negado.
      const { count } = await tx.refreshToken.deleteMany({
        where: {
          id: validToken.id,
        },
      });

      if (count === 0) {
        throw new AppException(
          AppException.errorCodes.auth.INVALID_REFRESH_TOKEN,
          "Acesso negado. O token de atualização fornecido é inválido.",
          AppException.HttpStatus.UNAUTHORIZED,
        );
      }

      // Armazena o novo refresh token
      await tx.refreshToken.create({
        data: {
          hashedToken: newTokens.hashedRefreshToken,
          customerId: validToken.customer.id,
        },
      });
    });

    return {
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
    };
  }

  async logout(data: { customerId: string; token: string }) {
    await this.prisma.refreshToken.delete({
      where: {
        customerId: data.customerId,
        hashedToken: hashString(data.token),
      },
    });
  }

  private async createCustomerOrRecoverOnConflict(
    phone: string,
    anonymousCustomer: AnonymousCustomer & { cart?: Cart },
  ): Promise<Customer> {
    try {
      return await this.customersService.createCustomerFromAnonymous({
        newCustomer: {
          phone,
        },
        anonymousCustomer: {
          cartId: anonymousCustomer.cart!.id,
          id: anonymousCustomer.id,
        },
      });
    } catch (error) {
      // Em logins concorrentes com o mesmo telefone, outra requisição pode ter
      // criado o cliente primeiro, violando a unicidade do telefone (P2002).
      // Nesse caso, recupera o cliente já existente em vez de falhar.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existingCustomer = await this.prisma.customer.findUnique({
          where: { phone },
        });

        if (existingCustomer) {
          return existingCustomer;
        }
      }

      throw error;
    }
  }

  private async findAnonymousCustomer(
    deviceId: string,
    config?: { throwIfNotFound: boolean; includeCart?: boolean },
  ) {
    const anonymousCustomer = await this.prisma.anonymousCustomer.findUnique({
      where: {
        deviceId,
      },
      ...(config?.includeCart && {
        include: {
          cart: true,
        },
      }),
    });

    if (!anonymousCustomer && config?.throwIfNotFound) {
      throw new AppException(
        AppException.errorCodes.auth.ANONYMOUS_CUSTOMER_NOT_FOUND,
        "Cliente não encontrado para o dispositivo fornecido.",
        AppException.HttpStatus.FORBIDDEN,
      );
    }

    return anonymousCustomer as
      | (AnonymousCustomer & {
          cart?: Cart;
        })
      | null;
  }

  private async validateOtpCode(props: {
    anonymousCustomerId: string;
    code: string;
  }) {
    const { anonymousCustomerId, code } = props;

    // Valida e consome o código de forma atômica: o próprio delete só afeta a
    // linha que casa com o hash e ainda está válida. Em requisições concorrentes
    // com o mesmo código, apenas uma deleta a linha (count 1) e as demais
    // recebem count 0, impedindo o reuso do mesmo código.
    const { count } = await this.prisma.otpCode.deleteMany({
      where: {
        anonymousCustomerId,
        hashedCode: hashString(code),
        expiresAt: {
          gte: new Date(),
        },
      },
    });

    if (count === 0) {
      throw new AppException(
        AppException.errorCodes.auth.INVALID_VERIFICATION_CODE,
        "Código de verificação inválido ou expirado.",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }
  }

  private generateTokens(payload: { customerId: string; phone: string }) {
    const {
      jwtSecret,
      jwtRefreshSecret,
      jwtExpirationTime,
      jwtRefreshExpirationTime,
    } = this.authConfig;

    const accessToken = jwt.sign(payload, jwtSecret, {
      expiresIn: jwtExpirationTime,
    });

    const refreshToken = jwt.sign(payload, jwtRefreshSecret, {
      expiresIn: jwtRefreshExpirationTime,
    });

    return {
      accessToken,
      refreshToken,
      hashedRefreshToken: hashString(refreshToken),
    };
  }
}
