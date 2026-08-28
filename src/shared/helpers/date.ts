import { DateTime } from "luxon";

const TIME_ZONE = "America/Sao_Paulo";
const MINUTE_IN_MS = 60 * 1000;

type CalendarUnit = "day" | "month" | "hour";

export type DateRange = {
  startDate?: Date;
  endDate?: Date;
};

export function getStartOfTodaySaoPaulo() {
  return DateTime.fromJSDate(new Date(), { zone: TIME_ZONE })
    .startOf("day")
    .toJSDate();
}

export function getEndOfDate(date: Date) {
  return DateTime.fromJSDate(date, { zone: "utc" })
    .setZone(TIME_ZONE, { keepLocalTime: true })
    .endOf("day")
    .toJSDate();
}

export function resolveDateRangeUnit({
  startDate,
  endDate,
}: DateRange): CalendarUnit {
  const MAX_DAILY_BUCKETS = 62;

  if (!startDate || !endDate) {
    return "month";
  }

  const daysBetween = countInclusiveDays(startDate, endDate);

  if (daysBetween <= 1) {
    return "hour";
  }

  if (daysBetween <= MAX_DAILY_BUCKETS) {
    return "day";
  }

  return "month";
}

export function listDataByDateUnit<T>(
  flatData: Array<{
    date: Date;
    data: T;
  }>,
  dateRange: DateRange,
) {
  const unit = resolveDateRangeUnit(dateRange);
  const dataByBucket = new Map<string, T[]>();

  if (
    dateRange?.startDate &&
    dateRange?.endDate &&
    dateRange.endDate < dateRange.startDate
  ) {
    return [];
  }

  for (const item of flatData) {
    const bucket = DateTime.fromJSDate(item.date, { zone: TIME_ZONE })
      .startOf(unit)
      .toFormat("yyyy-MM-dd'T'HH:mm");

    const bucketOrders = dataByBucket.get(bucket);

    if (bucketOrders) {
      bucketOrders.push(item.data);
    } else {
      dataByBucket.set(bucket, [item.data]);
    }
  }

  let buckets: string[] = [];

  // Sparse when a bound is missing: only the buckets that got data, ordered by
  // their keys. Dense otherwise: every bucket of the interval, enumerated.
  if (!dateRange?.startDate || !dateRange?.endDate) {
    buckets = [...dataByBucket.keys()].sort();
  } else {
    const lastBucket = DateTime.fromJSDate(dateRange.endDate, {
      zone: TIME_ZONE,
    })
      .startOf(unit)
      .toMillis();

    let cursor = DateTime.fromJSDate(dateRange.startDate, {
      zone: TIME_ZONE,
    }).startOf(unit);

    const MAX_BUCKETS = 600;

    while (cursor.toMillis() <= lastBucket && buckets.length < MAX_BUCKETS) {
      buckets.push(cursor.toFormat("yyyy-MM-dd'T'HH:mm"));

      cursor = cursor.plus({ [unit]: 1 });
    }
  }

  return buckets.map((bucketName) => {
    const data = dataByBucket.get(bucketName) ?? [];

    return {
      label: formatDateByUnit(bucketName, unit),
      data: data,
    };
  });
}

export function formatDateByUnit(bucket: string, unit: CalendarUnit) {
  const date = DateTime.fromISO(bucket, { zone: TIME_ZONE }).setLocale("pt-BR");

  if (unit === "hour") {
    return date.toFormat("HH:mm");
  }

  if (unit === "day") {
    return date.toFormat("dd/MM");
  }

  const monthAndYear = date.toFormat("LLLL/yyyy");

  return monthAndYear.charAt(0).toUpperCase() + monthAndYear.slice(1);
}

export function countInclusiveDays(startDate: Date, endDate: Date) {
  return (
    DateTime.fromJSDate(endDate, { zone: TIME_ZONE })
      .startOf("day")
      .diff(
        DateTime.fromJSDate(startDate, { zone: TIME_ZONE }).startOf("day"),
        "days",
      ).days + 1
  );
}

export function averageMinutes(spansInMs: number[]) {
  if (spansInMs.length === 0) {
    return null;
  }

  const total = spansInMs.reduce((sum, span) => sum + span, 0);

  return Math.round(total / spansInMs.length / MINUTE_IN_MS);
}
