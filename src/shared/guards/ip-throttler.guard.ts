import { Injectable } from "@nestjs/common";
import { BaseThrottlerGuard } from "./throttler.guard";

@Injectable()
export class IpThrottlerGuard extends BaseThrottlerGuard {}
