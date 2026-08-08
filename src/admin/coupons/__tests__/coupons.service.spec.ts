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

    it("should write eligibility rows when customerIds is provided", async () => {
      const coupon = CouponFactory.createOne();
      prismaMock.coupon.create.mockResolvedValue(coupon);
      prismaMock.customer.count.mockResolvedValue(2);
      prismaMock.couponCustomer.createMany.mockResolvedValue({ count: 2 });

      await service.createCoupon({
        ...baseDto,
        discountType: "FIXED",
        discountValue: 100,
        customerIds: ["customer-a", "customer-b"],
      });

      expect(prismaMock.customer.count).toHaveBeenCalledWith({
        where: { id: { in: ["customer-a", "customer-b"] } },
      });
      expect(prismaMock.couponCustomer.createMany).toHaveBeenCalledWith({
        data: [
          { couponId: coupon.id, customerId: "customer-a" },
          { couponId: coupon.id, customerId: "customer-b" },
        ],
      });
    });

    it("should not write eligibility rows when customerIds is omitted", async () => {
      prismaMock.coupon.create.mockResolvedValue(CouponFactory.createOne());

      await service.createCoupon({
        ...baseDto,
        discountType: "FIXED",
        discountValue: 100,
      });

      expect(prismaMock.customer.count).not.toHaveBeenCalled();
      expect(prismaMock.couponCustomer.createMany).not.toHaveBeenCalled();
    });

    it("should reject with CUSTOMER_NOT_FOUND when at least one customerId is unknown", async () => {
      prismaMock.customer.count.mockResolvedValue(1);

      await expect(
        service.createCoupon({
          ...baseDto,
          discountType: "FIXED",
          discountValue: 100,
          customerIds: ["customer-a", "customer-missing"],
        }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminCoupons.CUSTOMER_NOT_FOUND,
        httpStatus: AppException.HttpStatus.NOT_FOUND,
      });

      expect(prismaMock.coupon.create).not.toHaveBeenCalled();
      expect(prismaMock.couponCustomer.createMany).not.toHaveBeenCalled();
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

    it("should replace the eligibility set when customerIds is provided", async () => {
      const startsAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
      const existing = CouponFactory.createOne({ startsAt });
      prismaMock.coupon.findUnique.mockResolvedValue(existing);
      prismaMock.coupon.update.mockResolvedValue(existing);
      prismaMock.customer.count.mockResolvedValue(2);
      prismaMock.couponCustomer.createMany.mockResolvedValue({ count: 2 });

      await service.updateCoupon(existing.id, {
        discountType: "FIXED",
        discountValue: 100,
        minOrderValue: 0,
        startsAt,
        customerIds: ["customer-a", "customer-b"],
      });

      expect(prismaMock.couponCustomer.deleteMany).toHaveBeenCalledWith({
        where: { couponId: existing.id },
      });
      expect(prismaMock.couponCustomer.createMany).toHaveBeenCalledWith({
        data: [
          { couponId: existing.id, customerId: "customer-a" },
          { couponId: existing.id, customerId: "customer-b" },
        ],
      });
    });

    it("should clear all eligibility rows when customerIds is an empty array", async () => {
      const startsAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
      const existing = CouponFactory.createOne({ startsAt });
      prismaMock.coupon.findUnique.mockResolvedValue(existing);
      prismaMock.coupon.update.mockResolvedValue(existing);

      await service.updateCoupon(existing.id, {
        discountType: "FIXED",
        discountValue: 100,
        minOrderValue: 0,
        startsAt,
        customerIds: [],
      });

      expect(prismaMock.couponCustomer.deleteMany).toHaveBeenCalledWith({
        where: { couponId: existing.id },
      });
      expect(prismaMock.couponCustomer.createMany).not.toHaveBeenCalled();
    });

    it("should delete all eligibility rows when customerIds is omitted", async () => {
      const startsAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
      const existing = CouponFactory.createOne({ startsAt });
      prismaMock.coupon.findUnique.mockResolvedValue(existing);
      prismaMock.coupon.update.mockResolvedValue(existing);

      await service.updateCoupon(existing.id, {
        discountType: "FIXED",
        discountValue: 100,
        minOrderValue: 0,
        startsAt,
      });

      expect(prismaMock.couponCustomer.deleteMany).toHaveBeenCalledWith({
        where: { couponId: existing.id },
      });
      expect(prismaMock.couponCustomer.createMany).not.toHaveBeenCalled();
    });

    it("should reject with CUSTOMER_NOT_FOUND when at least one customerId is unknown", async () => {
      const startsAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
      const existing = CouponFactory.createOne({ startsAt });
      prismaMock.coupon.findUnique.mockResolvedValue(existing);
      prismaMock.customer.count.mockResolvedValue(1);

      await expect(
        service.updateCoupon(existing.id, {
          discountType: "FIXED",
          discountValue: 100,
          minOrderValue: 0,
          startsAt,
          customerIds: ["customer-a", "customer-missing"],
        }),
      ).rejects.toMatchObject({
        code: AppException.errorCodes.adminCoupons.CUSTOMER_NOT_FOUND,
        httpStatus: AppException.HttpStatus.NOT_FOUND,
      });

      expect(prismaMock.coupon.update).not.toHaveBeenCalled();
      expect(prismaMock.couponCustomer.createMany).not.toHaveBeenCalled();
    });
  });

  describe("findAll", () => {
    it("should report assignedCustomerCount as 0 for an open coupon", async () => {
      prismaMock.$queryRaw.mockResolvedValue([]);
      const coupon = CouponFactory.createOne();
      prismaMock.coupon.findMany.mockResolvedValue([
        { ...coupon, _count: { usages: 0, eligibleCustomers: 0 } },
      ]);
      prismaMock.coupon.count.mockResolvedValue(1);

      const result = await service.findAll({});

      expect(result.items[0].assignedCustomerCount).toBe(0);
    });
  });
});
