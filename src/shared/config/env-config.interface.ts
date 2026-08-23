import { SignOptions } from "jsonwebtoken";

export interface IDatabaseConfig {
  url: string;
}

export interface IApiConfig {
  port: number;
  delay: number;
}

export interface IAuthConfig {
  otpExpirationMinutes: number;
  jwtSecret: string;
  jwtRefreshSecret: string;
  jwtExpirationTime: SignOptions["expiresIn"];
  jwtRefreshExpirationTime: SignOptions["expiresIn"];
  deliveryPersonTokenExpirationMinutes: number;
  deliveryPersonRefreshExpirationMinutes: number;
}

export interface IAdminConfig {
  username: string;
  password: string;
}

export interface IStoreConfig {
  username: string;
  password: string;
}

export interface IExpoConfig {
  accessToken: string;
}

export interface IThrottlerWindow {
  ttl: number;
  limit: number;
}

export interface IRateLimitConfig {
  deviceSync: IThrottlerWindow;
  otpSend: IThrottlerWindow;
  otpSendLong: IThrottlerWindow;
  otpLogin: IThrottlerWindow;
  admin: IThrottlerWindow;
  deliveryPerson: IThrottlerWindow;
}
