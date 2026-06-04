import { Injectable } from "@nestjs/common";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { FindAllProductsDto } from "./dtos";

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(dto: FindAllProductsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      ...(dto.categoryId && { categoryId: dto.categoryId }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    };

    const orderBy = {
      ...(dto.sortKey && { [dto.sortKey]: dto.sortDirection }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: Object.keys(orderBy).length ? orderBy : { createdAt: "asc" },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
