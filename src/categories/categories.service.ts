import { Injectable } from "@nestjs/common";
import { PrismaService } from "../shared/database/prisma/prisma.service";

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.category.findMany({
      where: {
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        pluralName: true,
      },
    });
  }
}
