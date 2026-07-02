import { DateTime } from "luxon";

export function getStartOfDay(date = new Date()) {
  return DateTime.fromJSDate(date).startOf("day").toJSDate();
}

export function fixStartsAtTimeZone(date: Date) {
  const { offset } = DateTime.fromJSDate(date);

  return DateTime.fromJSDate(date).minus({ minutes: offset }).toJSDate();
}
