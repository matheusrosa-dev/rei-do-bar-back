import { Test, TestingModule } from "@nestjs/testing";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { AuthService } from "../auth.service";
import { AuthController } from "../auth.controller";
import { SyncDeviceIdDto } from "../dtos/sync-device-id.dto";

const authServiceMock = {
  syncDeviceId: jest.fn(),
};

describe("AuthController", () => {
  let controller: AuthController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authServiceMock }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("syncDeviceId", () => {
    it("should return the deviceId from AuthService", async () => {
      const deviceId = "123e4567-e89b-12d3-a456-426614174000";
      authServiceMock.syncDeviceId.mockResolvedValue({ deviceId });

      const result = await controller.syncDeviceId({ deviceId });

      expect(result).toEqual({ deviceId });
      expect(authServiceMock.syncDeviceId).toHaveBeenCalledWith({ deviceId });
    });

    it("should call AuthService with empty dto when no deviceId is provided", async () => {
      const generatedId = "generated-uuid";
      authServiceMock.syncDeviceId.mockResolvedValue({ deviceId: generatedId });

      const result = await controller.syncDeviceId({});

      expect(result).toEqual({ deviceId: generatedId });
      expect(authServiceMock.syncDeviceId).toHaveBeenCalledWith({});
    });
  });

  describe("DTO validation", () => {
    describe("SyncDeviceIdDto", () => {
      it("should pass when deviceId is a valid UUID", async () => {
        const dto = plainToInstance(SyncDeviceIdDto, {
          deviceId: "123e4567-e89b-12d3-a456-426614174000",
        });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it("should pass when deviceId is omitted", async () => {
        const dto = plainToInstance(SyncDeviceIdDto, {});
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it("should fail when deviceId is not a valid UUID", async () => {
        const dto = plainToInstance(SyncDeviceIdDto, {
          deviceId: "not-a-uuid",
        });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe("deviceId");
      });
    });
  });
});
