import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { Prisma } from "@shared/database/prisma/generated/client";
import { CouponOrderByWithRelationInput } from "@shared/database/prisma/generated/models";
import { AppException } from "@shared/exceptions/app.exception";
import { CreateCouponDto, FindAllCouponsDto } from "./dtos";

@Injectable()
export class AdminCouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(dto: FindAllCouponsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const now = new Date();

    const expired: Prisma.CouponWhereInput = { endsAt: { lt: now } };
    const usageLimitReached: Prisma.CouponWhereInput = {
      usageLimit: { lte: this.prisma.coupon.fields.usageCount },
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
          {
            OR: [
              { usageLimit: null },
              { usageLimit: { gt: this.prisma.coupon.fields.usageCount } },
            ],
          },
        ],
      }),
    };

    const orderBy: CouponOrderByWithRelationInput = {
      ...(dto.sortKey && { [dto.sortKey]: dto.sortDirection ?? "desc" }),
      ...(!dto.sortKey && { startsAt: "asc" }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.coupon.findMany({
        where,
        skip,
        take: limit,
        orderBy,
      }),
      this.prisma.coupon.count({ where }),
    ]);

    return {
      items: items.map((coupon) => ({
        ...coupon,
        hasStarted: coupon.startsAt <= now,
        isFinished:
          (coupon.endsAt !== null && coupon.endsAt < now) ||
          (coupon.usageLimit !== null &&
            coupon.usageCount >= coupon.usageLimit),
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
    this.assertValidDateRange(dto.startsAt, dto.endsAt);

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

  private assertValidDateRange(startsAt: Date, endsAt?: Date | null) {
    if (endsAt && endsAt <= startsAt) {
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
