import { registerAs } from "@nestjs/config";
import {
  IApiConfig,
  IAuthConfig,
  IDatabaseConfig,
} from "./env-config.interface";

import * as Joi from "joi";
import "dotenv/config";

export const apiConfig = registerAs<IApiConfig>("api", () => ({
  port: Number(process.env.API_PORT),
  delay: Number(process.env.API_DELAY),
}));

export const databaseConfig = registerAs<IDatabaseConfig>("database", () => ({
  url: process.env.DATABASE_URL!,
}));

export const authConfig = registerAs<IAuthConfig>("auth", () => ({
  otpExpirationMinutes: Number(process.env.AUTH_OTP_EXPIRATION_MINUTES),
}));

export const validationSchema = Joi.object({
  API_PORT: Joi.number().required(),
  API_DELAY: Joi.number().optional().default(0),

  DATABASE_URL: Joi.string().uri().required(),

  AUTH_OTP_EXPIRATION_MINUTES: Joi.number().required(),
});
