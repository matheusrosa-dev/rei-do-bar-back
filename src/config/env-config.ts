import { registerAs } from "@nestjs/config";
import { IApiConfig, IDatabaseConfig } from "./env-config.interface";

import * as Joi from "joi";
import "dotenv/config";

export const apiConfig = registerAs<IApiConfig>("api", () => ({
  port: Number(process.env.API_PORT),
}));

export const databaseConfig = registerAs<IDatabaseConfig>("database", () => ({
  url: process.env.DATABASE_URL!,
}));

export const validationSchema = Joi.object({
  API_PORT: Joi.number().required(),

  DATABASE_URL: Joi.string().uri().required(),
});
