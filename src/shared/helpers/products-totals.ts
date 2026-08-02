export type ProductsTotalsItem = {
  price: number;
  compareAtPrice: number | null;
  quantity: number;
};

export function computeProductsTotals(items: ProductsTotalsItem[]) {
  let productsCount = 0;
  let productsDiscount = 0;

  const productsTotal = items.reduce((sum, item) => {
    const { compareAtPrice, price, quantity } = item;
    const isOnSale = !!compareAtPrice && compareAtPrice > price;

    productsCount += quantity;

    if (isOnSale) {
      productsDiscount += (compareAtPrice - price) * quantity;
    }

    return sum + (isOnSale ? compareAtPrice : price) * quantity;
  }, 0);

  return {
    productsTotal,
    productsDiscount,
    productsCount,
    productsTotalLessDiscount: productsTotal - productsDiscount,
  };
}

export type OrderTotalsSource = {
  items: ProductsTotalsItem[];
  deliveryFee: number;
  couponDiscount: number;
};

// Não trava o total em zero: quem calcula o couponDiscount já o limita ao
// total líquido (CouponsService), então um total negativo aqui significaria
// dado inconsistente, e mascará-lo esconderia o problema.
export function computeOrderTotals(order: OrderTotalsSource) {
  const { productsTotal, productsDiscount, productsTotalLessDiscount } =
    computeProductsTotals(order.items);

  return {
    productsTotal,
    productsDiscount,
    total: productsTotalLessDiscount + order.deliveryFee - order.couponDiscount,
  };
}
