import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { Prisma } from "@shared/database/prisma/generated/client";
import {
  CouponModel,
  CouponOrderByWithRelationInput,
} from "@shared/database/prisma/generated/models";
import { AppException } from "@shared/exceptions/app.exception";
import {
  CreateCouponDto,
  FindAllCouponsDto,
  UpdateCouponBodyDto,
} from "./dtos";
import {
  isRecordNotFound,
  isUniqueConstraintViolation,
} from "@shared/helpers/prisma-errors";
import { CouponDiscountType } from "@shared/database/prisma/generated/enums";

const MAX_PERCENTAGE_DISCOUNT = 100;

@Injectable()
export class AdminCouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(dto: FindAllCouponsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const now = new Date();

    const usageLimitReachedIds = await this.getUsageLimitReachedCouponIds();

    const expired: Prisma.CouponWhereInput = { endsAt: { lt: now } };
    const usageLimitReached: Prisma.CouponWhereInput = {
      id: { in: usageLimitReachedIds },
    };

    const where: Prisma.CouponWhereInput = {
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.searchTerm && {
        code: { contains: dto.searchTerm, mode: "insensitive" },
      }),
      ...(dto.hasStarted !== undefined && {
        startsAt: dto.hasStarted ? { lte: now } : { gt: now },
      }),
      ...(dto.isFinished === true && { OR: [expired, usageLimitReached] }),
      ...(dto.isFinished === false && {
        AND: [
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          { id: { notIn: usageLimitReachedIds } },
        ],
      }),
    };

    const sortDirection = dto.sortDirection ?? "desc";

    let orderBy: CouponOrderByWithRelationInput = { startsAt: "asc" };
    if (dto.sortKey === "usageCount") {
      orderBy = { usages: { _count: sortDirection } };
    } else if (dto.sortKey) {
      orderBy = { [dto.sortKey]: sortDirection };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.coupon.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          _count: {
            select: { usages: true },
          },
          eligibleCustomers: {
            include: { customer: true },
          },
        },
      }),
      this.prisma.coupon.count({ where }),
    ]);

    return {
      items: items.map(({ _count, eligibleCustomers, ...coupon }) => ({
        ...coupon,
        usageCount: _count.usages,
        assignedCustomers: eligibleCustomers.map(({ customer }) => customer),
        hasStarted: coupon.startsAt <= now,
        isFinished:
          (coupon.endsAt !== null && coupon.endsAt <= now) ||
          usageLimitReachedIds.includes(coupon.id),
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async createCoupon(dto: CreateCouponDto) {
    this.assertDiscountValueIsValid(dto.discountType, dto.discountValue);

    if (dto.customerIds?.length) {
      await this.assertAllCustomersExist(dto.customerIds);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const coupon = await tx.coupon.create({
          data: {
            code: dto.code,
            discountType: dto.discountType,
            discountValue: dto.discountValue,
            minOrderValue: dto.minOrderValue,
            startsAt: dto.startsAt,
            endsAt: dto.endsAt ?? null,
            usageLimit: dto.customerIds?.length ?? dto.usageLimit ?? null,
            isActive: false,
          },
        });

        if (dto.customerIds?.length) {
          await tx.couponCustomer.createMany({
            data: dto.customerIds.map((customerId) => ({
              couponId: coupon.id,
              customerId,
            })),
          });
        }

        return coupon;
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new AppException(
          AppException.errorCodes.adminCoupons.COUPON_ALREADY_EXISTS,
          "Já existe um cupom com esse código.",
          AppException.HttpStatus.CONFLICT,
        );
      }

      throw error;
    }
  }

  async updateCoupon(couponId: string, dto: UpdateCouponBodyDto) {
    const existing = await this.prisma.coupon.findUnique({
      where: { id: couponId },
    });

    if (!existing) {
      throw new AppException(
        AppException.errorCodes.adminCoupons.COUPON_NOT_FOUND,
        "Cupom não encontrado.",
        AppException.HttpStatus.NOT_FOUND,
      );
    }

    this.assertDiscountValueIsValid(dto.discountType, dto.discountValue);

    const isEditingStartsAt =
      dto.startsAt.getTime() !== existing.startsAt.getTime();

    if (isEditingStartsAt) {
      this.assertStartsAtEditable(existing);

      this.assertStartsAtInFuture(dto.startsAt);
    }

    if (dto.usageLimit) {
      await this.assertUsageLimitAboveUsage(couponId, dto.usageLimit);
    }

    if (dto.customerIds?.length) {
      await this.assertAllCustomersExist(dto.customerIds);
    }

    return this.prisma.$transaction(async (tx) => {
      const coupon = await tx.coupon.update({
        where: { id: couponId },
        data: {
          discountType: dto.discountType,
          discountValue: dto.discountValue,
          minOrderValue: dto.minOrderValue,
          startsAt: dto.startsAt,
          endsAt: dto.endsAt ?? null,
          usageLimit: dto.customerIds?.length ?? dto.usageLimit ?? null,
        },
      });

      await tx.couponCustomer.deleteMany({ where: { couponId } });

      if (dto.customerIds?.length) {
        await tx.couponCustomer.createMany({
          data: dto.customerIds.map((customerId) => ({
            couponId,
            customerId,
          })),
        });
      }

      return coupon;
    });
  }

  async activateCoupon(couponId: string) {
    return this.updateCouponOrThrow(couponId, { isActive: true });
  }

  async deactivateCoupon(couponId: string) {
    try {
      const [coupon] = await this.prisma.$transaction([
        this.prisma.coupon.update({
          where: { id: couponId },
          data: { isActive: false },
        }),
        this.prisma.cart.updateMany({
          where: { couponId },
          data: { couponId: null },
        }),
      ]);

      return coupon;
    } catch (error) {
      if (isRecordNotFound(error)) {
        throw new AppException(
          AppException.errorCodes.adminCoupons.COUPON_NOT_FOUND,
          "Cupom não encontrado.",
          AppException.HttpStatus.NOT_FOUND,
        );
      }

      throw error;
    }
  }

  async removeCoupon(couponId: string) {
    try {
      await this.prisma.coupon.delete({ where: { id: couponId } });
    } catch (error) {
      if (isRecordNotFound(error)) {
        throw new AppException(
          AppException.errorCodes.adminCoupons.COUPON_NOT_FOUND,
          "Cupom não encontrado.",
          AppException.HttpStatus.NOT_FOUND,
        );
      }

      throw error;
    }
  }

  private async updateCouponOrThrow(
    couponId: string,
    data: Prisma.CouponUpdateInput,
  ) {
    try {
      return await this.prisma.coupon.update({
        where: { id: couponId },
        data,
      });
    } catch (error) {
      if (isRecordNotFound(error)) {
        throw new AppException(
          AppException.errorCodes.adminCoupons.COUPON_NOT_FOUND,
          "Cupom não encontrado.",
          AppException.HttpStatus.NOT_FOUND,
        );
      }

      if (isUniqueConstraintViolation(error)) {
        throw new AppException(
          AppException.errorCodes.adminCoupons.COUPON_ALREADY_EXISTS,
          "Já existe um cupom com esse código.",
          AppException.HttpStatus.CONFLICT,
        );
      }

      throw error;
    }
  }

  private async getUsageLimitReachedCouponIds(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT c.id
      FROM coupons c
      JOIN coupon_usages cu ON cu.coupon_id = c.id
      WHERE c.usage_limit IS NOT NULL
      GROUP BY c.id, c.usage_limit
      HAVING COUNT(cu.id) >= c.usage_limit
    `;

    return rows.map((row) => row.id);
  }

  private assertStartsAtEditable(existing: CouponModel) {
    const now = new Date();

    if (existing.startsAt <= now) {
      throw new AppException(
        AppException.errorCodes.adminCoupons.COUPON_START_NOT_EDITABLE,
        "Não é possível alterar a data de início de um cupom que já foi iniciado.",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }
  }

  private assertStartsAtInFuture(startsAt: Date) {
    const now = new Date();

    if (startsAt <= now) {
      throw new AppException(
        AppException.errorCodes.adminCoupons.COUPON_START_NOT_EDITABLE,
        "A data de início deve ser uma data futura.",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }
  }

  private assertDiscountValueIsValid(
    discountType: CouponDiscountType,
    discountValue: number,
  ) {
    if (
      discountType === CouponDiscountType.PERCENTAGE &&
      discountValue > MAX_PERCENTAGE_DISCOUNT
    ) {
      throw new AppException(
        AppException.errorCodes.adminCoupons.INVALID_DISCOUNT_VALUE,
        `O desconto percentual não pode ser maior que ${MAX_PERCENTAGE_DISCOUNT}%.`,
        AppException.HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async assertUsageLimitAboveUsage(
    couponId: string,
    usageLimit: number,
  ) {
    const usageCount = await this.prisma.couponUsage.count({
      where: { couponId },
    });

    if (usageLimit <= usageCount) {
      throw new AppException(
        AppException.errorCodes.adminCoupons.INVALID_USAGE_LIMIT,
        "O limite de uso deve ser maior que a quantidade já utilizada do cupom.",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async assertAllCustomersExist(customerIds: string[]) {
    const uniqueIds = [...new Set(customerIds)];
    const foundCount = await this.prisma.customer.count({
      where: { id: { in: uniqueIds } },
    });

    if (foundCount !== uniqueIds.length) {
      throw new AppException(
        AppException.errorCodes.adminCoupons.CUSTOMER_NOT_FOUND,
        "Um ou mais clientes informados não foram encontrados.",
        AppException.HttpStatus.NOT_FOUND,
      );
    }
  }
}
