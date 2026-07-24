import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { AppException } from "@shared/exceptions/app.exception";
import { prismaMock } from "@shared/testing/mocks";
import { CouponFactory } from "@shared/testing/factories";
import { AdminCouponsService } from "../coupons.service";

describe("AdminCouponsService", () => {
  let service: AdminCouponsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminCouponsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<AdminCouponsService>(AdminCouponsService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("createCoupon", () => {
    const baseDto = {
      code: "PROMO10",
      minOrderValue: 0,
      startsAt: new Date(),
    };

    it("should reject a PERCENTAGE discount above 100", async () => {
      await expect(
        service.createCoupon({
          ...baseDto,
          discountType: "PERCENTAGE",
          discountValue: 150,
        }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminCoupons.INVALID_DISCOUNT_VALUE,
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });

      expect(prismaMock.coupon.create).not.toHaveBeenCalled();
    });

    it("should accept a PERCENTAGE discount of exactly 100", async () => {
      prismaMock.coupon.create.mockResolvedValue(
        CouponFactory.createOne({ discountType: "PERCENTAGE" }),
      );

      await service.createCoupon({
        ...baseDto,
        discountType: "PERCENTAGE",
        discountValue: 100,
      });

      expect(prismaMock.coupon.create).toHaveBeenCalled();
    });

    it("should not restrict a FIXED discount above 100", async () => {
      prismaMock.coupon.create.mockResolvedValue(
        CouponFactory.createOne({ discountType: "FIXED" }),
      );

      await service.createCoupon({
        ...baseDto,
        discountType: "FIXED",
        discountValue: 1000,
      });

      expect(prismaMock.coupon.create).toHaveBeenCalled();
    });
  });

  describe("updateCoupon", () => {
    it("should reject a PERCENTAGE discount above 100 before persisting", async () => {
      const startsAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
      const existing = CouponFactory.createOne({ startsAt });
      prismaMock.coupon.findUnique.mockResolvedValue(existing);

      await expect(
        service.updateCoupon(existing.id, {
          discountType: "PERCENTAGE",
          discountValue: 150,
          minOrderValue: 0,
          startsAt,
        }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminCoupons.INVALID_DISCOUNT_VALUE,
        httpStatus: AppException.HttpStatus.BAD_REQUEST,
      });

      expect(prismaMock.coupon.update).not.toHaveBeenCalled();
    });

    it("should accept a PERCENTAGE discount of exactly 100", async () => {
      const startsAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
      const existing = CouponFactory.createOne({ startsAt });
      prismaMock.coupon.findUnique.mockResolvedValue(existing);
      prismaMock.coupon.update.mockResolvedValue({
        ...existing,
        discountType: "PERCENTAGE",
        discountValue: 100,
      });

      await service.updateCoupon(existing.id, {
        discountType: "PERCENTAGE",
        discountValue: 100,
        minOrderValue: 0,
        startsAt,
      });

      expect(prismaMock.coupon.update).toHaveBeenCalled();
    });
  });
});
