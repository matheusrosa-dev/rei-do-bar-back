import { getEndOfDate, getNowSaoPaulo, getStartOfTodaySaoPaulo } from "../date";

describe("Date Helpers", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe("getStartOfTodaySaoPaulo", () => {
    it("should return the start of today in the America/Sao_Paulo timezone", () => {
      jest.useFakeTimers().setSystemTime(new Date("2026-07-02T10:00:00.000Z"));

      const result = getStartOfTodaySaoPaulo();

      expect(result).toEqual(new Date("2026-07-02T03:00:00.000Z"));
    });

    it("should use the Sao Paulo calendar day, not the UTC calendar day, near midnight", () => {
      // 2026-07-02T01:00:00Z is already July 2nd in UTC, but still July 1st at 22:00 in Sao Paulo (UTC-3).
      jest.useFakeTimers().setSystemTime(new Date("2026-07-02T01:00:00.000Z"));

      const result = getStartOfTodaySaoPaulo();

      expect(result).toEqual(new Date("2026-07-01T03:00:00.000Z"));
    });
  });

  describe("getNowSaoPaulo", () => {
    it("should return the current instant", () => {
      const now = new Date("2026-07-02T12:34:56.789Z");
      jest.useFakeTimers().setSystemTime(now);

      const result = getNowSaoPaulo();

      expect(result).toEqual(now);
    });

    it("should return a Date instance", () => {
      const result = getNowSaoPaulo();

      expect(result).toBeInstanceOf(Date);
    });
  });

  describe("getEndOfDate", () => {
    it("should return the end of the day for the given date", () => {
      const date = new Date("2026-07-02T15:34:12.500");

      const result = getEndOfDate(date);

      expect(result.getFullYear()).toBe(date.getFullYear());
      expect(result.getMonth()).toBe(date.getMonth());
      expect(result.getDate()).toBe(date.getDate());
      expect(result.getHours()).toBe(23);
      expect(result.getMinutes()).toBe(59);
      expect(result.getSeconds()).toBe(59);
      expect(result.getMilliseconds()).toBe(999);
    });

    it("should handle the last day of a leap-year February correctly", () => {
      const date = new Date("2024-02-29T08:00:00.000");

      const result = getEndOfDate(date);

      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(1);
      expect(result.getDate()).toBe(29);
      expect(result.getHours()).toBe(23);
      expect(result.getMinutes()).toBe(59);
      expect(result.getSeconds()).toBe(59);
      expect(result.getMilliseconds()).toBe(999);
    });

    it("should not roll over into the next year when given December 31st", () => {
      const date = new Date("2026-12-31T20:00:00.000");

      const result = getEndOfDate(date);

      expect(result.getFullYear()).toBe(2026);
      expect(result.getMonth()).toBe(11);
      expect(result.getDate()).toBe(31);
    });

    it("should not mutate the original date", () => {
      const date = new Date("2026-07-02T15:34:12.500");
      const original = date.getTime();

      getEndOfDate(date);

      expect(date.getTime()).toBe(original);
    });
  });
});
