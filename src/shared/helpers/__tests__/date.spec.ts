import {
  averageMinutes,
  countInclusiveDays,
  formatDateByUnit,
  getEndOfDate,
  getStartOfTodaySaoPaulo,
  listDataByDateUnit,
  resolveDateRangeUnit,
} from "../date";

const at = (isoDate: string, time = "12:00:00") =>
  new Date(`${isoDate}T${time}-03:00`);

const point = (date: Date) => ({ date, data: date.toISOString() });

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

  describe("resolveDateRangeUnit", () => {
    it("should fall back to months when either bound is missing", () => {
      expect(resolveDateRangeUnit({})).toBe("month");
      expect(resolveDateRangeUnit({ startDate: at("2026-08-01") })).toBe(
        "month",
      );
      expect(resolveDateRangeUnit({ endDate: at("2026-08-31") })).toBe("month");
    });

    it("should pick the unit from the span, at both edges of each threshold", () => {
      const unitOf = (startDate: Date, endDate: Date) =>
        resolveDateRangeUnit({ startDate, endDate });

      expect(unitOf(at("2026-08-26"), at("2026-08-26"))).toBe("hour");
      expect(unitOf(at("2026-08-26"), at("2026-08-27"))).toBe("day");
      // 62 counted days is still daily; 63 flips to monthly.
      expect(unitOf(at("2026-07-01"), at("2026-08-31"))).toBe("day");
      expect(unitOf(at("2026-06-30"), at("2026-08-31"))).toBe("month");
    });
  });

  describe("countInclusiveDays", () => {
    it("should count both ends of the interval", () => {
      expect(countInclusiveDays(at("2026-08-26"), at("2026-08-26"))).toBe(1);
      expect(countInclusiveDays(at("2026-07-01"), at("2026-08-31"))).toBe(62);
    });

    it("should count calendar days, ignoring the time of day on either bound", () => {
      expect(
        countInclusiveDays(
          at("2026-08-26", "23:00:00"),
          at("2026-08-27", "01:00:00"),
        ),
      ).toBe(2);
    });
  });

  describe("formatDateByUnit", () => {
    it("should label each unit in pt-BR", () => {
      expect(formatDateByUnit("2026-08-26T14:00", "hour")).toBe("14:00");
      expect(formatDateByUnit("2026-08-26", "day")).toBe("26/08");
      expect(formatDateByUnit("2026-08-01", "month")).toBe("Agosto/2026");
    });
  });

  describe("listDataByDateUnit", () => {
    it("should group by the Sao Paulo calendar, not the UTC one", () => {
      // 01:30Z is already the 27th in UTC, but still 22:30 on the 26th in Sao Paulo.
      const series = listDataByDateUnit(
        [point(new Date("2026-08-27T01:30:00.000Z"))],
        { startDate: at("2026-08-26"), endDate: at("2026-08-27") },
      );

      expect(series.map(({ label, data }) => [label, data.length])).toEqual([
        ["26/08", 1],
        ["27/08", 0],
      ]);
    });

    it("should keep each hour apart within a single-day range", () => {
      const series = listDataByDateUnit(
        [
          point(at("2026-08-26", "14:30:00")),
          point(at("2026-08-26", "20:45:00")),
        ],
        {
          startDate: at("2026-08-26", "00:00:00"),
          endDate: at("2026-08-26", "23:59:59"),
        },
      );

      // The key has to carry the hour: with toISODate() all 24 hours fall into the
      // same key and the series becomes a single point, labelled 00:00.
      expect(series).toHaveLength(24);
      expect(series[14].label).toBe("14:00");
      expect(series[14].data).toHaveLength(1);
      expect(series[20].data).toHaveLength(1);
      expect(series[0].data).toHaveLength(0);
    });

    it("should zero-fill the buckets between two bounds", () => {
      const series = listDataByDateUnit(
        [point(at("2026-06-10")), point(at("2026-08-27"))],
        { startDate: at("2026-06-01"), endDate: at("2026-08-31") },
      );

      expect(series.map(({ label, data }) => [label, data.length])).toEqual([
        ["Junho/2026", 1],
        ["Julho/2026", 0],
        ["Agosto/2026", 1],
      ]);
    });

    it("should stay sparse and ascending when a bound is missing", () => {
      const series = listDataByDateUnit(
        [point(at("2026-08-27")), point(at("2026-06-10"))],
        {},
      );

      expect(series.map(({ label }) => label)).toEqual([
        "Junho/2026",
        "Agosto/2026",
      ]);
    });

    it("should return nothing for an inverted range, even inside a single bucket", () => {
      expect(
        listDataByDateUnit([], {
          startDate: at("2026-08-28"),
          endDate: at("2026-08-26"),
        }),
      ).toEqual([]);
      expect(
        listDataByDateUnit([], {
          startDate: at("2026-08-10", "10:00:00"),
          endDate: at("2026-08-10", "08:00:00"),
        }),
      ).toEqual([]);
    });

    it("should stop at the ceiling instead of running past the 4-digit year era", () => {
      const series = listDataByDateUnit([], {
        startDate: at("2026-01-01"),
        endDate: at("9999-12-31"),
      });

      // Past 9999 luxon emits the expanded year ("+010000-01-01"), and "+" sorts
      // below every digit: comparing the buckets as strings made the loop never
      // end. The cut drops the most recent end.
      expect(series).toHaveLength(600);
      expect(series[0].label).toBe("Janeiro/2026");
      expect(series[599].label).toBe("Dezembro/2075");
    });
  });

  describe("averageMinutes", () => {
    it("should round the average once, at the end", () => {
      const twentyMinutes = 20 * 60 * 1000;
      const twentyOneMinutesForty = 21 * 60 * 1000 + 40 * 1000;

      // 20min50s truncates to 20 and rounds to 21.
      expect(averageMinutes([twentyMinutes, twentyOneMinutesForty])).toBe(21);
    });

    it("should answer null, not zero, for an empty sample", () => {
      // Zero is a real average under half a minute; null is "nothing to measure".
      expect(averageMinutes([])).toBeNull();
      expect(averageMinutes([0])).toBe(0);
    });
  });
});
