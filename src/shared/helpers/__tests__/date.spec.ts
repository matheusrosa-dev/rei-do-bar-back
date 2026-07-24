import { getEndOfDate, getStartOfTodaySaoPaulo } from "../date";

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

  describe("getEndOfDate", () => {
    it("should close the day at 23:59:59.999 in the America/Sao_Paulo timezone", () => {
      const date = new Date("2026-07-02T00:00:00.000Z");

      const result = getEndOfDate(date);

      expect(result).toEqual(new Date("2026-07-03T02:59:59.999Z"));
    });

    it("should keep the calendar day sent by the client, regardless of the time of day", () => {
      const date = new Date("2026-07-02T15:34:12.500Z");

      const result = getEndOfDate(date);

      expect(result).toEqual(new Date("2026-07-03T02:59:59.999Z"));
    });

    it("should handle the last day of a leap-year February correctly", () => {
      const date = new Date("2024-02-29T08:00:00.000Z");

      const result = getEndOfDate(date);

      expect(result).toEqual(new Date("2024-03-01T02:59:59.999Z"));
    });

    it("should not roll over into the next year when given December 31st", () => {
      const date = new Date("2026-12-31T20:00:00.000Z");

      const result = getEndOfDate(date);

      expect(result).toEqual(new Date("2027-01-01T02:59:59.999Z"));
    });

    it("should not mutate the original date", () => {
      const date = new Date("2026-07-02T15:34:12.500Z");
      const original = date.getTime();

      getEndOfDate(date);

      expect(date.getTime()).toBe(original);
    });
  });
});
