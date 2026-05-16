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
}
