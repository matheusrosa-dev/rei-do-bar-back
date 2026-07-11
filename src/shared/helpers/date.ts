import { DateTime } from "luxon";

export function getStartOfTodaySaoPaulo() {
  return DateTime.fromJSDate(new Date(), { zone: "America/Sao_Paulo" })
    .startOf("day")
    .toJSDate();
}

export function getEndOfDate(date: Date) {
  return DateTime.fromJSDate(date).endOf("day").toJSDate();
}
