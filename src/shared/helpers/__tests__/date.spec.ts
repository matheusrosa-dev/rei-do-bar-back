import { DateTime } from "luxon";
import { fixStartsAtTimeZone, getStartOfDay } from "../date";

describe("Date Helpers", () => {
  describe("getStartOfDay", () => {
    it("should return the start of the day for the given date", () => {
      const date = new Date("2026-07-02T15:34:12.500");

      const result = getStartOfDay(date);

      expect(result.getFullYear()).toBe(date.getFullYear());
      expect(result.getMonth()).toBe(date.getMonth());
      expect(result.getDate()).toBe(date.getDate());
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });

    it("should default to the current day when no date is provided", () => {
      const result = getStartOfDay();

      const expected = DateTime.now().startOf("day").toJSDate();

      expect(result).toEqual(expected);
    });
  });

  describe("fixStartsAtTimeZone", () => {
    it("should subtract the timezone offset from the given date", () => {
      const date = new Date("2026-07-02T00:00:00.000");
      const { offset } = DateTime.fromJSDate(date);

      const result = fixStartsAtTimeZone(date);

      const expected = DateTime.fromJSDate(date)
        .minus({ minutes: offset })
        .toJSDate();

      expect(result).toEqual(expected);
    });

    it("should not mutate the original date", () => {
      const date = new Date("2026-07-02T00:00:00.000");
      const original = date.getTime();

      fixStartsAtTimeZone(date);

      expect(date.getTime()).toBe(original);
    });
  });
});
