import { Injectable } from "@nestjs/common";
import { BaseThrottlerGuard } from "./throttler.guard";

@Injectable()
export class OtpThrottlerGuard extends BaseThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const headers = req.headers as Record<string, string | undefined>;

    return headers["x-device-id"] ?? (req.ip as string);
  }
}
