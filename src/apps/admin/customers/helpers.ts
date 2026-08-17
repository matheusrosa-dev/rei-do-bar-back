import { Prisma } from "@shared/database/prisma/generated/client";

export type CustomerWithRelations = Prisma.CustomerGetPayload<{
  include: { addresses: true; orders: true };
}>;
