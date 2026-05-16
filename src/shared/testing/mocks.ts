export const prismaMock = {
  $transaction: jest
    .fn()
    .mockImplementation((callback) => callback(prismaMock)),
  anonymousCustomer: {
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  product: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  cart: {
    update: jest.fn(),
  },
  setting: {
    findUnique: jest.fn(),
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
  customer: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    delete: jest.fn(),
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
