import {
  PrismaClient,
  SettingKey,
  SettingType,
} from "../../src/shared/database/prisma/generated/client";

export const settings = [
  {
    key: SettingKey.DELIVERY_FEE,
    type: SettingType.CURRENCY,
    value: "0",
    isActive: false,
  },
  {
    key: SettingKey.MIN_ORDER_VALUE,
    type: SettingType.CURRENCY,
    value: "0",
    isActive: false,
  },
  {
    key: SettingKey.ALERT_MESSAGE,
    type: SettingType.TEXT,
    value: "Nossos estoques ainda são limitados, por favor tenha paciência!",
    isActive: false,
  },
  {
    key: SettingKey.WHATSAPP_CONTACT,
    type: SettingType.PHONE,
    value: "11964645573",
    isActive: false,
  },
  {
    key: SettingKey.OUTSIDE_BUSINESS_HOURS,
    type: SettingType.TEXT,
    value:
      "Estamos fechados no momento. Atendemos de segunda a sábado, das 18h às 23h. 🍻",
    isActive: false,
  },
  {
    key: SettingKey.ON_BREAK,
    type: SettingType.TEXT,
    value:
      "Estamos temporariamente fechados. Voltaremos a receber pedidos em 23/06. Até breve! 🍻",
    isActive: false,
  },
  {
    key: SettingKey.WELCOME_COUPON,
    type: SettingType.CURRENCY,
    value: "500",
    isActive: false,
  },
];

export async function seedSettings(prisma: PrismaClient) {
  console.log("Seeding settings...");

  const settingsFound = await prisma.setting.findMany({
    where: {
      OR: settings.map((setting) => ({ key: setting.key })),
    },
  });

  const existingKeys = new Set(settingsFound.map((setting) => setting.key));

  const nonExistingSettings = settings.filter(
    (setting) => !existingKeys.has(setting.key),
  );

  await prisma.setting.createMany({
    data: nonExistingSettings.map((setting) => ({
      key: setting.key,
      type: setting.type,
      value: setting.value,
      isActive: setting.isActive,
    })),
  });

  const settingsCount = settings.length;
  const nonExistingCount = nonExistingSettings.length;

  console.log(
    `${nonExistingCount} settings seeded (${settingsCount - nonExistingCount} already existed).`,
  );
}
