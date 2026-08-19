const RECENT_ORDERS_WINDOW_HOURS = 10;

export function getRecentOrdersWindowStart(now: Date = new Date()) {
  return new Date(now.getTime() - RECENT_ORDERS_WINDOW_HOURS * 60 * 60 * 1000);
}
