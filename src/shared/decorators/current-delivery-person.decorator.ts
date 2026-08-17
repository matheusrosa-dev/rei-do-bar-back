import { ExecutionContext, createParamDecorator } from "@nestjs/common";
import { Request } from "express";
import "@shared/types/delivery-person";

export const CurrentDeliveryPerson = createParamDecorator(
  (_data, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest() as Request;

    return request.deliveryPerson!;
  },
);
