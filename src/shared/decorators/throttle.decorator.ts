import { UseGuards, applyDecorators } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { OtpThrottlerGuard } from "@shared/guards/store/otp-throttler.guard";
import { IpThrottlerGuard } from "@shared/guards/ip-throttler.guard";

export const DEVICE_THROTTLERS = [
  "otpSend",
  "otpSendLong",
  "otpLogin",
] as const;

export const IP_THROTTLERS = ["deviceSync"] as const;

export const THROTTLER_NAMES = [
  ...DEVICE_THROTTLERS,
  ...IP_THROTTLERS,
] as const;

type ThrottlerName = (typeof THROTTLER_NAMES)[number];
const applyThrottlers = (names: readonly ThrottlerName[]) => {
  const skip: Record<string, boolean> = {};

  for (const name of THROTTLER_NAMES) {
    skip[name] = !names.includes(name);
  }

  return SkipThrottle(skip);
};

type DeviceThrottlerName = (typeof DEVICE_THROTTLERS)[number];
export const DeviceThrottle = (...names: DeviceThrottlerName[]) =>
  applyDecorators(UseGuards(OtpThrottlerGuard), applyThrottlers(names));

type IpThrottlerName = (typeof IP_THROTTLERS)[number];
export const IpThrottle = (...names: IpThrottlerName[]) =>
  applyDecorators(UseGuards(IpThrottlerGuard), applyThrottlers(names));
