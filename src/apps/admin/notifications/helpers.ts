import { DateTime } from "luxon";

export const INACTIVITY_DAYS = 30;

export function getInactivityCutoff(): Date {
  return DateTime.now().minus({ days: INACTIVITY_DAYS }).toJSDate();
}
