import { DateTime } from "luxon";

export enum NotificationTarget {
  ALL = "ALL",
  NO_ORDERS = "NO_ORDERS",
  ABANDONED_CART = "ABANDONED_CART",
  INACTIVE_30_DAYS = "INACTIVE_30_DAYS",
  SINGLE_ORDER = "SINGLE_ORDER",
}

export const INACTIVITY_DAYS = 30;

export function getInactivityCutoff(): Date {
  return DateTime.now().minus({ days: INACTIVITY_DAYS }).toJSDate();
}
