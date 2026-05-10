import { Test, TestingModule } from "@nestjs/testing";
import { AuthService } from "../auth.service";
import { AuthController } from "../auth.controller";
import { authServiceMock } from "@shared/testing/mocks";

describe("AuthController", () => {
  let controller: AuthController;

  beforeEach(async () => {
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
});
