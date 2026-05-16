import {
  PrismaClient,
  SettingKey,
} from "../../src/shared/database/prisma/generated/client";

export const settings = [{ key: SettingKey.DELIVERY_FEE, value: "200" }];

export async function seedSettings(prisma: PrismaClient) {
  console.log("Seeding settings...");

  const settingsFound = await prisma.setting.findMany({
    where: {
      OR: settings.map((setting) => ({ key: setting.key })),
    },
  });

  const nonExistingSettings = settings.filter(
    (_, index) => !settingsFound[index],
  );

  await prisma.setting.createMany({
    data: nonExistingSettings.map((setting) => ({
      key: setting.key,
      value: setting.value,
    })),
  });

  const settingsCount = settings.length;
  const nonExistingCount = nonExistingSettings.length;

  console.log(
    `${nonExistingCount} settings seeded (${settingsCount - nonExistingCount} already existed).`,
  );
}
