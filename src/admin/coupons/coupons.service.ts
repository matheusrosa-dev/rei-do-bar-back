import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { Prisma } from "@shared/database/prisma/generated/client";
import {
  CouponModel,
  CouponOrderByWithRelationInput,
} from "@shared/database/prisma/generated/models";
import { AppException } from "@shared/exceptions/app.exception";
import { fixStartsAtTimeZone, getStartOfDay } from "@shared/helpers/date";
import {
  CreateCouponDto,
  FindAllCouponsDto,
  UpdateCouponBodyDto,
} from "./dtos";

@Injectable()
export class AdminCouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(dto: FindAllCouponsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const startOfToday = getStartOfDay();

    const usageLimitReachedIds = await this.getUsageLimitReachedCouponIds();

    const expired: Prisma.CouponWhereInput = { endsAt: { lt: startOfToday } };
    const usageLimitReached: Prisma.CouponWhereInput = {
      id: { in: usageLimitReachedIds },
    };

    const where: Prisma.CouponWhereInput = {
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.searchTerm && {
        code: { contains: dto.searchTerm, mode: "insensitive" },
      }),
      ...(dto.hasStarted !== undefined && {
        startsAt: dto.hasStarted ? { lte: startOfToday } : { gt: startOfToday },
      }),
      ...(dto.isFinished === true && { OR: [expired, usageLimitReached] }),
      ...(dto.isFinished === false && {
        AND: [
          { OR: [{ endsAt: null }, { endsAt: { gte: startOfToday } }] },
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
        include: { _count: { select: { usages: true } } },
      }),
      this.prisma.coupon.count({ where }),
    ]);

    return {
      items: items.map(({ _count, ...coupon }) => ({
        ...coupon,
        usageCount: _count.usages,
        hasStarted: coupon.startsAt <= startOfToday,
        isFinished:
          (coupon.endsAt !== null && coupon.endsAt < startOfToday) ||
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

  async createCoupon(dto: CreateCouponDto) {
    this.assertValidDateRange(dto.startsAt, dto.endsAt);
    this.assertStartsAtInFuture(dto.startsAt);

    try {
      const coupon = await this.prisma.coupon.create({
        data: {
          code: dto.code,
          discountType: dto.discountType,
          discountValue: dto.discountValue,
          minOrderValue: dto.minOrderValue,
          startsAt: dto.startsAt,
          endsAt: dto.endsAt ?? null,
          usageLimit: dto.usageLimit ?? null,
          isActive: false,
        },
      });

      return coupon;
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
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

    const isEditingStartsAt =
      dto.startsAt.getTime() !== existing.startsAt.getTime();

    if (isEditingStartsAt) {
      this.assertStartsAtEditable(existing, dto.startsAt);
    }

    this.assertValidDateRange(dto.startsAt, dto.endsAt);
    await this.assertUsageLimitAboveUsage(couponId, dto.usageLimit);

    return this.updateCouponOrThrow(couponId, {
      discountType: dto.discountType,
      discountValue: dto.discountValue,
      minOrderValue: dto.minOrderValue,
      startsAt: dto.startsAt,
      endsAt: dto.endsAt ?? null,
      usageLimit: dto.usageLimit ?? null,
    });
  }

  async activateCoupon(couponId: string) {
    return this.updateCouponOrThrow(couponId, { isActive: true });
  }

  async deactivateCoupon(couponId: string) {
    return this.updateCouponOrThrow(couponId, { isActive: false });
  }

  async removeCoupon(couponId: string) {
    try {
      await this.prisma.coupon.delete({ where: { id: couponId } });
    } catch (error) {
      if (this.isRecordNotFound(error)) {
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
      if (this.isRecordNotFound(error)) {
        throw new AppException(
          AppException.errorCodes.adminCoupons.COUPON_NOT_FOUND,
          "Cupom não encontrado.",
          AppException.HttpStatus.NOT_FOUND,
        );
      }

      if (this.isUniqueConstraintViolation(error)) {
        throw new AppException(
          AppException.errorCodes.adminCoupons.COUPON_ALREADY_EXISTS,
          "Já existe um cupom com esse código.",
          AppException.HttpStatus.CONFLICT,
        );
      }

      throw error;
    }
  }

  private assertStartsAtEditable(existing: CouponModel, newStartsAt: Date) {
    const startOfToday = getStartOfDay();

    if (existing.startsAt <= startOfToday) {
      throw new AppException(
        AppException.errorCodes.adminCoupons.COUPON_START_NOT_EDITABLE,
        "Não é possível alterar a data de início de um cupom que já foi iniciado.",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }

    this.assertStartsAtInFuture(newStartsAt);
  }

  private assertStartsAtInFuture(startsAt: Date) {
    const startOfToday = getStartOfDay();
    const fixedStartsAt = fixStartsAtTimeZone(startsAt);

    if (fixedStartsAt < startOfToday) {
      throw new AppException(
        AppException.errorCodes.adminCoupons.COUPON_START_NOT_EDITABLE,
        "A data de início deve ser uma data futura.",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async assertUsageLimitAboveUsage(
    couponId: string,
    usageLimit?: number | null,
  ) {
    if (!usageLimit) return;

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

  private assertValidDateRange(startsAt: Date, endsAt?: Date | null) {
    if (endsAt && endsAt < startsAt) {
      throw new AppException(
        AppException.errorCodes.adminCoupons.INVALID_DATE_RANGE,
        "A data de término deve ser posterior à data de início.",
        AppException.HttpStatus.BAD_REQUEST,
      );
    }
  }

  private isRecordNotFound(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    );
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }
}
