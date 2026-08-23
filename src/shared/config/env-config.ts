import { registerAs } from "@nestjs/config";
import {
  IAdminConfig,
  IApiConfig,
  IAuthConfig,
  IDatabaseConfig,
  IDeliveryPersonConfig,
  IExpoConfig,
  IRateLimitConfig,
  IStoreConfig,
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

  deliveryPersonTokenExpirationMinutes: Number(
    process.env.AUTH_DELIVERY_PERSON_TOKEN_EXPIRATION_MINUTES,
  ),
  deliveryPersonRefreshExpirationMinutes: Number(
    process.env.AUTH_DELIVERY_PERSON_REFRESH_EXPIRATION_MINUTES,
  ),
}));

export const adminConfig = registerAs<IAdminConfig>("admin", () => ({
  username: process.env.ADMIN_USERNAME!,
  password: process.env.ADMIN_PASSWORD!,
}));

export const storeConfig = registerAs<IStoreConfig>("store", () => ({
  username: process.env.STORE_USERNAME!,
  password: process.env.STORE_PASSWORD!,
}));

export const deliveryPersonConfig = registerAs<IDeliveryPersonConfig>(
  "deliveryPerson",
  () => ({
    username: process.env.DELIVERY_PERSON_USERNAME!,
    password: process.env.DELIVERY_PERSON_PASSWORD!,
  }),
);

export const expoConfig = registerAs<IExpoConfig>("expo", () => ({
  accessToken: process.env.EXPO_ACCESS_TOKEN!,
}));

export const rateLimitConfig = registerAs<IRateLimitConfig>(
  "rateLimit",
  () => ({
    deviceSync: {
      ttl: Number(process.env.RATE_LIMIT_DEVICE_SYNC_TTL) * 1000,
      limit: Number(process.env.RATE_LIMIT_DEVICE_SYNC_LIMIT),
    },
    otpSend: {
      ttl: Number(process.env.RATE_LIMIT_OTP_SEND_TTL) * 1000,
      limit: Number(process.env.RATE_LIMIT_OTP_SEND_LIMIT),
    },
    otpSendLong: {
      ttl: Number(process.env.RATE_LIMIT_OTP_SEND_LONG_TTL) * 1000,
      limit: Number(process.env.RATE_LIMIT_OTP_SEND_LONG_LIMIT),
    },
    otpLogin: {
      ttl: Number(process.env.RATE_LIMIT_OTP_LOGIN_TTL) * 1000,
      limit: Number(process.env.RATE_LIMIT_OTP_LOGIN_LIMIT),
    },
    admin: {
      ttl: Number(process.env.RATE_LIMIT_ADMIN_TTL) * 1000,
      limit: Number(process.env.RATE_LIMIT_ADMIN_LIMIT),
    },
    deliveryPerson: {
      ttl: Number(process.env.RATE_LIMIT_DELIVERY_PERSON_TTL) * 1000,
      limit: Number(process.env.RATE_LIMIT_DELIVERY_PERSON_LIMIT),
    },
  }),
);

export const validationSchema = Joi.object({
  API_PORT: Joi.number().required(),
  API_DELAY: Joi.number().optional().default(0),

  DATABASE_URL: Joi.string().uri().required(),

  AUTH_OTP_EXPIRATION_MINUTES: Joi.number().required(),
  AUTH_JWT_SECRET: Joi.string().min(32).required(),
  AUTH_JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  AUTH_JWT_EXPIRATION_TIME: Joi.string().required(),
  AUTH_JWT_REFRESH_EXPIRATION_TIME: Joi.string().required(),
  AUTH_DELIVERY_PERSON_TOKEN_EXPIRATION_MINUTES: Joi.number().required(),
  AUTH_DELIVERY_PERSON_REFRESH_EXPIRATION_MINUTES: Joi.number().required(),

  STORE_USERNAME: Joi.string().required(),
  STORE_PASSWORD: Joi.string().required(),

  ADMIN_USERNAME: Joi.string().required(),
  ADMIN_PASSWORD: Joi.string().required(),

  DELIVERY_PERSON_USERNAME: Joi.string().required(),
  DELIVERY_PERSON_PASSWORD: Joi.string().required(),

  EXPO_ACCESS_TOKEN: Joi.string().required(),

  RATE_LIMIT_DEVICE_SYNC_TTL: Joi.number().required(),
  RATE_LIMIT_DEVICE_SYNC_LIMIT: Joi.number().required(),
  RATE_LIMIT_OTP_SEND_TTL: Joi.number().required(),
  RATE_LIMIT_OTP_SEND_LIMIT: Joi.number().required(),
  RATE_LIMIT_OTP_SEND_LONG_TTL: Joi.number().required(),
  RATE_LIMIT_OTP_SEND_LONG_LIMIT: Joi.number().required(),
  RATE_LIMIT_OTP_LOGIN_TTL: Joi.number().required(),
  RATE_LIMIT_OTP_LOGIN_LIMIT: Joi.number().required(),
  RATE_LIMIT_ADMIN_TTL: Joi.number().required(),
  RATE_LIMIT_ADMIN_LIMIT: Joi.number().required(),
  RATE_LIMIT_DELIVERY_PERSON_TTL: Joi.number().required(),
  RATE_LIMIT_DELIVERY_PERSON_LIMIT: Joi.number().required(),
});
