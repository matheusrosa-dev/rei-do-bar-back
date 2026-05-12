import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { randomUUID } from "node:crypto";
import {
  LoginWithCodeDto,
  SyncDeviceIdDto,
  VerifyCustomerPhoneDto,
} from "./dtos";
import { AppException } from "@shared/exceptions/app.exception";
import { Customer } from "@shared/database/prisma/generated/client";

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async syncDeviceId(dto: SyncDeviceIdDto) {
    let deviceId = dto?.deviceId;

    if (!deviceId) {
      deviceId = randomUUID();
    }

    const existingCustomer = await this.findCustomerByDeviceId(deviceId);

    if (!existingCustomer) {
      await this.prisma.customer.create({
        data: {
          deviceId,
          isActive: true,
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

  async verifyCustomerPhone(deviceId: string, dto: VerifyCustomerPhoneDto) {
    const customer = (await this.findCustomerByDeviceId(deviceId, {
      throwIfNotFound: true,
    }))!;

    const alreadyHasVerificationCode = await this.prisma.otpCodes.findFirst({
      where: {
        customerId: customer.id,
        expiresAt: {
          gte: new Date(),
        },
      },
    });

    let code = alreadyHasVerificationCode?.code;

    if (!alreadyHasVerificationCode) {
      code = this.generateCode();

      await this.prisma.otpCodes.create({
        data: {
          code,
          customerId: customer.id,
          //TODO: ADICIONAR NO ENV
          //TODO: ADICIONAR DELIVERY FEE NO ENV TAMBEM
          expiresAt: new Date(Date.now() + 5 * 60 * 1000), // Expira em 5 minutos
        },
      });
    }

    //TODO: INTEGRAR COM SERVIÇO DE ENVIO DE SMS
    // TODO: remover console.log
    console.log(`Telefone: ${dto.phone}`);
    console.log(`Código de verificação: ${code}`);
  }

  async loginWithCode(deviceId: string, dto: LoginWithCodeDto) {
    const customerFromDeviceId = (await this.findCustomerByDeviceId(deviceId, {
      throwIfNotFound: true,
    }))!;

    await this.validateOtpCode({
      customerId: customerFromDeviceId.id,
      code: dto.code,
    });

    let customerWithPhone: Customer | null;

    customerWithPhone = await this.prisma.customer.findUnique({
      where: {
        phone: dto.phone,
      },
    });

    if (customerWithPhone && !customerWithPhone.isActive) {
      throw new AppException(
        AppException.errorCodes.auth.INACTIVE_CUSTOMER,
        "Este número de telefone está associado a um cliente inativo. Por favor, entre em contato com o suporte.",
        AppException.HttpStatus.FORBIDDEN,
      );
    }

    if (!customerWithPhone) {
      customerWithPhone = await this.prisma.customer.update({
        where: {
          id: customerFromDeviceId.id,
        },
        data: {
          phone: dto.phone,
          deviceId: null,
        },
      });
    }

    //TODO: gerar token JWT e retornar
    console.log(`Cliente ${customerWithPhone!.id} autenticado com sucesso!`);
  }

  private async findCustomerByDeviceId(
    deviceId: string,
    config?: { throwIfNotFound: boolean },
  ) {
    const customerFromDeviceId = await this.prisma.customer.findUnique({
      where: {
        deviceId,
      },
    });

    if (!customerFromDeviceId && config?.throwIfNotFound) {
      throw new AppException(
        AppException.errorCodes.auth.CUSTOMER_NOT_FOUND,
        "Cliente não encontrado para o dispositivo fornecido.",
        AppException.HttpStatus.FORBIDDEN,
      );
    }

    return customerFromDeviceId;
  }

  private async validateOtpCode(props: { customerId: string; code: string }) {
    const { customerId, code } = props;

    const verificationCode = await this.prisma.otpCodes.findUnique({
      where: {
        customerId,
        code: code,
        expiresAt: {
          gte: new Date(),
        },
      },
    });

    if (!verificationCode) {
      throw new AppException(
        AppException.errorCodes.auth.INVALID_VERIFICATION_CODE,
        "Código de verificação inválido ou expirado.",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    await this.prisma.otpCodes.delete({
      where: {
        id: verificationCode.id,
      },
    });
  }

  private generateCode() {
    const codeLength = 6;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const values = crypto.getRandomValues(new Uint8Array(codeLength));

    return Array.from(values, (value) => chars[value % chars.length]).join("");
  }
}
