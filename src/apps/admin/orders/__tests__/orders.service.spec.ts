import { EventEmitter2 } from "@nestjs/event-emitter";
import { Test, TestingModule } from "@nestjs/testing";
import { OrderStatus } from "@shared/database/prisma/generated/enums";
import { PrismaService } from "@shared/database/prisma/prisma.service";
import { prismaMock } from "@shared/testing/mocks";
import { AdminOrdersService } from "../orders.service";

const ORDER_ID = "order-id";
const DELIVERY_PERSON_ID = "delivery-person-id";

const eventEmitterMock = { emit: jest.fn() };

const makeOrder = (overrides?: Partial<Record<string, unknown>>) => ({
  id: ORDER_ID,
  customerId: "customer-id",
  orderNumber: 1042,
  status: OrderStatus.PREPARING,
  statusReason: null,
  deliveryFee: 500,
  couponDiscount: 0,
  deliveryPersonId: null,
  shippedAt: null,
  deliveredAt: null,
  cancelledAt: null,
  items: [
    { productId: "product-id", price: 1500, compareAtPrice: null, quantity: 2 },
  ],
  ...overrides,
});

const mockEmptyBoard = () => {
  prismaMock.order.findMany.mockResolvedValue([]);
};

const getBoardQueries = () =>
  prismaMock.order.findMany.mock.calls.map(([args]) => args);

describe("AdminOrdersService", () => {
  let service: AdminOrdersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminOrdersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EventEmitter2, useValue: eventEmitterMock },
      ],
    }).compile();

    service = module.get<AdminOrdersService>(AdminOrdersService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("listOrdersManagement", () => {
    it("should split the board into four queries, giving SHIPPED one of its own", async () => {
      mockEmptyBoard();

      await service.listOrdersManagement();

      const [ongoing, shipped] = getBoardQueries();

      // As quatro têm que sair do mesmo snapshot: soltas, um pedido despachado
      // no meio da leitura aparece em duas colunas ou em nenhuma.
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.order.findMany).toHaveBeenCalledTimes(4);
      expect(ongoing).toEqual(
        expect.objectContaining({
          where: {
            status: { in: [OrderStatus.PENDING, OrderStatus.PREPARING] },
          },
          orderBy: [{ createdAt: "asc" }, { orderNumber: "asc" }],
        }),
      );
      expect(shipped).toEqual(
        expect.objectContaining({
          where: { status: OrderStatus.SHIPPED },
        }),
      );
    });

    it("should order the shipped column by dispatch time with the unstamped orders first", async () => {
      mockEmptyBoard();

      await service.listOrdersManagement();

      const [, shipped] = getBoardQueries();

      // Sem o nulls: "first", o padrão do Postgres em ASC joga para o fim da
      // fila justamente os pedidos despachados antes da coluna existir, que são
      // os mais antigos — a migration não fez backfill.
      expect(shipped.orderBy).toEqual([
        { shippedAt: { sort: "asc", nulls: "first" } },
        { orderNumber: "asc" },
      ]);
    });

    it("should keep the shipped column uncapped and unwindowed, unlike the finalized ones", async () => {
      mockEmptyBoard();

      await service.listOrdersManagement();

      const [, shipped, delivered, cancelled] = getBoardQueries();

      expect(shipped.take).toBeUndefined();
      expect(shipped.where.shippedAt).toBeUndefined();
      expect(delivered.take).toBe(30);
      expect(cancelled.take).toBe(30);
    });

    it("should build the shipped column from its own query, not from the ongoing one", async () => {
      const ongoingOrder = makeOrder({ status: OrderStatus.PENDING });
      const shippedOrder = makeOrder({
        id: "shipped-order-id",
        status: OrderStatus.SHIPPED,
      });

      prismaMock.order.findMany
        .mockResolvedValueOnce([ongoingOrder])
        .mockResolvedValueOnce([shippedOrder])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const board = await service.listOrdersManagement();

      expect(board[OrderStatus.PENDING]).toHaveLength(1);
      expect(board[OrderStatus.SHIPPED]).toHaveLength(1);
      expect(board[OrderStatus.SHIPPED][0]).toEqual(
        expect.objectContaining({ id: "shipped-order-id", total: 3500 }),
      );
    });
  });

  describe("updateOrderStatus", () => {
    const shipOrder = () =>
      service.updateOrderStatus(ORDER_ID, {
        status: OrderStatus.SHIPPED,
        deliveryPersonId: DELIVERY_PERSON_ID,
      });

    beforeEach(() => {
      mockEmptyBoard();
      prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.deliveryPerson.findUnique.mockResolvedValue({
        isActive: true,
      });
    });

    it("should stamp shippedAt alongside the delivery person on the shipped transition", async () => {
      const now = new Date("2026-08-25T14:00:00.000Z");
      jest.useFakeTimers().setSystemTime(now);

      try {
        prismaMock.order.findUnique.mockResolvedValue(makeOrder());

        await shipOrder();

        // Sem o shippedAt aqui a coluna nasce nula e as duas filas — o board e
        // o app do entregador — voltam a ordenar por hora do pedido.
        expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
          where: { id: ORDER_ID, status: OrderStatus.PREPARING },
          data: {
            status: OrderStatus.SHIPPED,
            deliveryPersonId: DELIVERY_PERSON_ID,
            shippedAt: now,
          },
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it("should not stamp shippedAt on a transition that does not ship the order", async () => {
      prismaMock.order.findUnique.mockResolvedValue(
        makeOrder({ status: OrderStatus.PENDING }),
      );

      await service.updateOrderStatus(ORDER_ID, {
        status: OrderStatus.PREPARING,
      });

      expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
        where: { id: ORDER_ID, status: OrderStatus.PENDING },
        data: { status: OrderStatus.PREPARING },
      });
    });

    it("should lock the delivery person row before stamping", async () => {
      prismaMock.order.findUnique.mockResolvedValue(makeOrder());

      await shipOrder();

      // O lock é template tag, então o id entra como segundo argumento. Travar
      // outra linha, ou travar depois da escrita, não serializa nada contra a
      // exclusão concorrente do entregador.
      expect(prismaMock.$queryRaw).toHaveBeenCalledWith(
        expect.anything(),
        DELIVERY_PERSON_ID,
      );
      expect(prismaMock.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prismaMock.order.updateMany.mock.invocationCallOrder[0],
      );
      expect(prismaMock.deliveryPerson.findUnique).toHaveBeenCalledWith({
        where: { id: DELIVERY_PERSON_ID },
        select: { isActive: true },
      });
    });
  });

  describe("updateOrderDeliveryPerson", () => {
    it("should not restamp shippedAt when the delivery person is reassigned", async () => {
      const shippedAt = new Date("2026-08-25T10:00:00.000Z");

      prismaMock.order.findUnique.mockResolvedValue(
        makeOrder({ status: OrderStatus.SHIPPED, shippedAt }),
      );
      prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.deliveryPerson.findUnique.mockResolvedValue({
        isActive: true,
      });

      await service.updateOrderDeliveryPerson(ORDER_ID, {
        deliveryPersonId: "another-delivery-person-id",
      });

      expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
        where: { id: ORDER_ID, status: OrderStatus.SHIPPED },
        data: { deliveryPersonId: "another-delivery-person-id" },
      });
      // A reatribuição devolve o pedido, não o board — e não pode reordenar a
      // fila de quem já está na rua.
      expect(prismaMock.order.findMany).not.toHaveBeenCalled();
    });
  });
});
