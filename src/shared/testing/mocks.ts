export const prismaMock = {
  $transaction: jest
    .fn()
    .mockImplementation((callback) => callback(prismaMock)),
  $queryRaw: jest.fn(),
  anonymousCustomer: {
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  product: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  cart: {
    update: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  cartItem: {
    deleteMany: jest.fn(),
  },
  coupon: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  couponUsage: {
    count: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    deleteMany: jest.fn(),
  },
  order: {
    count: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  setting: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  category: {
    findMany: jest.fn(),
  },
  otpCode: {
    delete: jest.fn(),
    deleteMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  address: {
    count: jest.fn(),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  customer: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  refreshToken: {
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  pushToken: {
    upsert: jest.fn(),
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
};

export const cartServiceMock = {
  getCart: jest.fn(),
  addToCart: jest.fn(),
  incrementProductQuantity: jest.fn(),
  decrementProductQuantity: jest.fn(),
  removeFromCart: jest.fn(),
};

export const authServiceMock = {
  syncDeviceId: jest.fn(),
};

export const categoriesServiceMock = {
  findAll: jest.fn(),
};

export const productsServiceMock = {
  findBestSellers: jest.fn(),
};

export const settingsServiceMock = {
  findAll: jest.fn(),
};

export const couponsServiceMock = {
  isCouponUnavailable: jest.fn(),
  calculateDiscount: jest.fn(),
  hasReachedUsageLimit: jest.fn(),
  hasCustomerUsedCoupon: jest.fn(),
};
