import Chance from "chance";
import { Product } from "@shared/database/prisma/generated/client";

const chance = new Chance();

type Props = {
  id?: string;
  name?: string;
  description?: string;
  price?: number;
  imageUrl?: string;
  isActive?: boolean;
  stock: number;
  categoryId?: string;
  sortOrder?: number;
};

export class ProductFactory {
  static createOne(props: Props) {
    return makeProduct(props);
  }
  static createMany(count: number, props: Props) {
    return Array.from({ length: count }, () => makeProduct(props));
  }
}

const makeProduct = (props: Props): Product => ({
  id: props?.id ?? chance.guid(),
  name: props?.name ?? chance.word(),
  description: props?.description ?? chance.sentence(),
  price: props?.price ?? chance.integer({ min: 10, max: 100 }),
  imageUrl: props?.imageUrl ?? chance.url({ extensions: ["jpg", "png"] }),
  isActive: props?.isActive ?? true,
  stock: props.stock,
  categoryId: props?.categoryId ?? chance.guid(),
  sortOrder: props.sortOrder ?? 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
});
