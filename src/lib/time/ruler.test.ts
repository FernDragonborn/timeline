import { describe, expect, it } from "vitest";
import { dayNumberToIso, isoToDayNumber } from "./day-number";
import {
  PERIOD_KIND,
  RULER_TIER,
  periodsInRange,
  snapKindForTier,
  snapToPeriodEnd,
  snapToPeriodStart,
  tierForScale,
} from "./ruler";

const snapStart = (iso: string, kind: Parameters<typeof snapToPeriodStart>[1]): string =>
  dayNumberToIso(snapToPeriodStart(isoToDayNumber(iso), kind));
const snapEnd = (iso: string, kind: Parameters<typeof snapToPeriodEnd>[1]): string =>
  dayNumberToIso(snapToPeriodEnd(isoToDayNumber(iso), kind));

describe("вибір ярусу за масштабом", () => {
  it("переходить від років до днів у міру наближення", () => {
    expect(tierForScale(0.1)).toBe(RULER_TIER.Years);
    expect(tierForScale(0.5)).toBe(RULER_TIER.Quarters);
    expect(tierForScale(1.4)).toBe(RULER_TIER.Months);
    expect(tierForScale(6)).toBe(RULER_TIER.Weeks);
    expect(tierForScale(20)).toBe(RULER_TIER.Days);
  });
});

describe("прилипання до поділок", () => {
  it("тягне межі місяця, включно з останнім днем", () => {
    expect(snapStart("2026-11-27", PERIOD_KIND.Month)).toBe("2026-11-01");
    expect(snapEnd("2026-11-27", PERIOD_KIND.Month)).toBe("2026-11-30");
  });

  it("рахує лютий високосного року", () => {
    expect(snapEnd("2024-02-10", PERIOD_KIND.Month)).toBe("2024-02-29");
    expect(snapEnd("2026-02-10", PERIOD_KIND.Month)).toBe("2026-02-28");
  });

  it("починає тиждень з понеділка", () => {
    /* 2026-03-05 — четвер. */
    expect(snapStart("2026-03-05", PERIOD_KIND.Week)).toBe("2026-03-02");
    expect(snapEnd("2026-03-05", PERIOD_KIND.Week)).toBe("2026-03-08");
    /* Неділя належить попередньому тижню, а не наступному. */
    expect(snapStart("2026-03-08", PERIOD_KIND.Week)).toBe("2026-03-02");
  });

  it("тягне до кварталу й до року", () => {
    expect(snapStart("2026-05-17", PERIOD_KIND.Quarter)).toBe("2026-04-01");
    expect(snapEnd("2026-05-17", PERIOD_KIND.Quarter)).toBe("2026-06-30");
    expect(snapStart("2026-05-17", PERIOD_KIND.Year)).toBe("2026-01-01");
    expect(snapEnd("2026-05-17", PERIOD_KIND.Year)).toBe("2026-12-31");
  });

  it("на добовому ярусі нічого не змінює", () => {
    expect(snapStart("2026-05-17", PERIOD_KIND.Day)).toBe("2026-05-17");
    expect(snapEnd("2026-05-17", PERIOD_KIND.Day)).toBe("2026-05-17");
  });

  it("прилипає до того, що видно на лінійці", () => {
    expect(snapKindForTier(RULER_TIER.Days)).toBe(PERIOD_KIND.Day);
    expect(snapKindForTier(RULER_TIER.Months)).toBe(PERIOD_KIND.Month);
    expect(snapKindForTier(RULER_TIER.Years)).toBe(PERIOD_KIND.Year);
  });
});

describe("побудова поділок", () => {
  it("будує лише для заданого вікна, а не для всього домену", () => {
    const from = isoToDayNumber("2026-01-01");
    const to = isoToDayNumber("2026-03-31");
    const months = periodsInRange(PERIOD_KIND.Month, from, to);
    /* Січень…березень плюс один період-хвіст, на якому цикл зупиняється. */
    expect(months.length).toBeLessThanOrEqual(4);
    expect(months[0]?.startDay).toBe(from);
  });

  it("не падає й нічого не повертає на перевернутому діапазоні", () => {
    const day = isoToDayNumber("2026-01-01");
    expect(periodsInRange(PERIOD_KIND.Day, day, day - 10)).toEqual([]);
  });

  it("позначає суботу й неділю лише на добовому ярусі", () => {
    const from = isoToDayNumber("2026-01-01");
    const days = periodsInRange(PERIOD_KIND.Day, from, isoToDayNumber("2026-01-07"));
    expect(days.filter((period) => period.isWeekend)).toHaveLength(2);

    const months = periodsInRange(PERIOD_KIND.Month, from, isoToDayNumber("2026-06-01"));
    expect(months.every((period) => !period.isWeekend)).toBe(true);
  });
});
