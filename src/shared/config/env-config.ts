import { registerAs } from "@nestjs/config";
import {
  IAdminConfig,
  IApiConfig,
  IAuthConfig,
  IDatabaseConfig,
} from "./env-config.interface";

import * as Joi from "joi";
import "dotenv/config";
import { SignOptions } from "jsonwebtoken";

export const apiConfig = registerAs<IApiConfig>("api", () => ({
  port: Number(process.env.API_PORT),
  delay: Number(process.env.API_DELAY),
}));

export const databaseConfig = registerAs<IDatabaseConfig>("database", () => ({
  url: process.env.DATABASE_URL!,
}));

export const authConfig = registerAs<IAuthConfig>("auth", () => ({
  otpExpirationMinutes: Number(process.env.AUTH_OTP_EXPIRATION_MINUTES),

  jwtSecret: process.env.AUTH_JWT_SECRET!,
  jwtRefreshSecret: process.env.AUTH_JWT_REFRESH_SECRET!,
  jwtExpirationTime: process.env
    .AUTH_JWT_EXPIRATION_TIME as SignOptions["expiresIn"],
  jwtRefreshExpirationTime: process.env
    .AUTH_JWT_REFRESH_EXPIRATION_TIME as SignOptions["expiresIn"],
}));

export const adminConfig = registerAs<IAdminConfig>("admin", () => ({
  username: process.env.ADMIN_USERNAME!,
  password: process.env.ADMIN_PASSWORD!,
}));

export const validationSchema = Joi.object({
  API_PORT: Joi.number().required(),
  API_DELAY: Joi.number().optional().default(0),

  DATABASE_URL: Joi.string().uri().required(),

  AUTH_OTP_EXPIRATION_MINUTES: Joi.number().required(),
  AUTH_JWT_SECRET: Joi.string().min(32).required(),
  AUTH_JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  AUTH_JWT_EXPIRATION_TIME: Joi.string().required(),
  AUTH_JWT_REFRESH_EXPIRATION_TIME: Joi.string().required(),

  ADMIN_USERNAME: Joi.string().required(),
  ADMIN_PASSWORD: Joi.string().required(),
});
