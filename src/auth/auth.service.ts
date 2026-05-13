import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { randomUUID } from "node:crypto";
import {
  VerifyCodeDto,
  SyncDeviceIdDto,
  SendVerificationCodeDto,
} from "./dtos";
import { AppException } from "@shared/exceptions/app.exception";
import {
  AnonymousCustomer,
  Cart,
  Customer,
} from "@shared/database/prisma/generated/client";
import { ConfigService } from "@nestjs/config";
import { IAuthConfig } from "@shared/config/env-config.interface";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";

@Injectable()
export class AuthService {
  private readonly authConfig: IAuthConfig;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.authConfig = configService.get<IAuthConfig>("auth")!;
  }

  async syncDeviceId(dto: SyncDeviceIdDto) {
    let deviceId = dto?.deviceId;

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

  async sendVerificationCode(deviceId: string, dto: SendVerificationCodeDto) {
    const anonymousCustomer = (await this.findAnonymousCustomer(deviceId, {
      throwIfNotFound: true,
    }))!;

    const { code, hashedCode } = this.generateHashedCode();

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

    // TODO: remover console.log
    console.log(`Código de verificação: ${code}`);
  }

  // TODO: adicionar testes
  async verifyCode(deviceId: string, dto: VerifyCodeDto) {
    const anonymousCustomer = (await this.findAnonymousCustomer(deviceId, {
      throwIfNotFound: true,
      includeCart: true,
    }))!;

    await this.validateOtpCode({
      anonymousCustomerId: anonymousCustomer.id,
      code: dto.code,
    });

    let customer: Customer | null;

    // Verifica se já existe um cliente associado a esse número de telefone
    customer = await this.prisma.customer.findUnique({
      where: {
        phone: dto.phone,
      },
    });

    if (customer && !customer.isActive) {
      throw new AppException(
        AppException.errorCodes.auth.INACTIVE_CUSTOMER,
        "Este número de telefone está associado a um cliente inativo. Por favor, entre em contato com o suporte.",
        AppException.HttpStatus.FORBIDDEN,
      );
    }

    if (!customer) {
      customer = await this.prisma.$transaction(async (tx) => {
        // Cria um novo cliente ativo com o número de telefone fornecido
        const newCustomer = await tx.customer.create({
          data: {
            phone: dto.phone,
            isActive: true,
          },
        });

        await Promise.all([
          // Atribui o carrinho anônimo ao novo cliente
          tx.cart.update({
            where: {
              id: anonymousCustomer.cart!.id,
            },
            data: {
              anonymousCustomerId: null,
              customerId: newCustomer.id,
            },
          }),

          // Remove o cliente anônimo, já que não é mais necessário
          tx.anonymousCustomer.delete({
            where: {
              id: anonymousCustomer.id,
            },
          }),
        ]);

        return newCustomer;
      });
    }

    const tokens = this.generateTokens({
      customerId: customer.id,
      phone: customer.phone,
    });

    // TODO: remover console.log
    console.log(tokens);

    return tokens;
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

    // Verifica se existe um código de verificação válido para o cliente anônimo
    const verificationCode = await this.prisma.otpCode.findFirst({
      where: {
        anonymousCustomerId,
        expiresAt: {
          gte: new Date(),
        },
      },
    });

    if (
      !verificationCode ||
      this.hashCode(code) !== verificationCode.hashedCode
    ) {
      throw new AppException(
        AppException.errorCodes.auth.INVALID_VERIFICATION_CODE,
        "Código de verificação inválido ou expirado.",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    // Remove o código de verificação após a validação bem-sucedida
    await this.prisma.otpCode.deleteMany({
      where: {
        anonymousCustomerId,
      },
    });
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

    return { accessToken, refreshToken };
  }

  private generateHashedCode() {
    const codeLength = 6;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const values = crypto.getRandomValues(new Uint8Array(codeLength));

    const code = Array.from(
      values,
      (value) => chars[value % chars.length],
    ).join("");

    const hashedCode = this.hashCode(code);

    return {
      code,
      hashedCode,
    };
  }

  private hashCode(code: string) {
    return crypto.createHash("sha256").update(code).digest("hex");
  }
}
