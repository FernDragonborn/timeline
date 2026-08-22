import { describe, expect, it } from "vitest";
import {
  dayAtBodyPixel,
  marqueeSides,
  quickEventRange,
  rectanglesOverlap,
  snappedCreationRange,
  wheelStepPixels,
} from "./canvas-gestures";
import { RULER_TIER } from "../time/ruler";
import { isoToDayNumber } from "../time/day-number";

const domain = { fromDay: isoToDayNumber("2026-01-01"), toDay: isoToDayNumber("2026-12-31") };

describe("крок колеса", () => {
  it("бере ту вісь, на яку браузер поклав крок", () => {
    expect(wheelStepPixels({ deltaMode: 0, deltaX: 0, deltaY: 100 })).toBe(100);
    /* З Shift Chromium сам переносить крок у deltaX. */
    expect(wheelStepPixels({ deltaMode: 0, deltaX: 100, deltaY: 0 })).toBe(100);
  });

  it("не губить напрямок", () => {
    expect(wheelStepPixels({ deltaMode: 0, deltaX: 0, deltaY: -120 })).toBe(-120);
  });

  it("переводить крок у рядках у пікселі", () => {
    expect(wheelStepPixels({ deltaMode: 1, deltaX: 0, deltaY: 3 })).toBe(99);
  });
});

describe("день під курсором", () => {
  it("не виходить за домен", () => {
    expect(dayAtBodyPixel(domain, 2, -1000)).toBe(domain.fromDay);
    expect(dayAtBodyPixel(domain, 2, 10_000_000)).toBe(domain.toDay);
  });

  it("округлює до найближчого дня", () => {
    expect(dayAtBodyPixel(domain, 10, 26)).toBe(domain.fromDay + 3);
  });
});

describe("рамка виділення", () => {
  it("впорядковує сторони, хоч куди її тягли", () => {
    expect(marqueeSides({ fromX: 300, fromY: 200, toX: 100, toY: 50 })).toEqual({
      left: 100,
      right: 300,
      top: 50,
      bottom: 200,
    });
  });

  it("ловить те, чого лише торкнулася", () => {
    const box = { left: 0, right: 100, top: 0, bottom: 100 };
    expect(rectanglesOverlap({ left: 100, right: 140, top: 50, bottom: 60 }, box)).toBe(true);
    expect(rectanglesOverlap({ left: 101, right: 140, top: 50, bottom: 60 }, box)).toBe(false);
    expect(rectanglesOverlap({ left: 20, right: 40, top: 101, bottom: 140 }, box)).toBe(false);
  });
});

describe("прилипання нової події", () => {
  it("по днях лишає точні дати", () => {
    const range = snappedCreationRange(
      isoToDayNumber("2026-03-04"),
      isoToDayNumber("2026-03-09"),
      RULER_TIER.Days,
    );
    expect(range.startDay).toBe(isoToDayNumber("2026-03-04"));
    expect(range.endDay).toBe(isoToDayNumber("2026-03-09"));
  });

  it("по тижнях дає цілі тижні з понеділка по неділю", () => {
    const range = snappedCreationRange(
      isoToDayNumber("2026-03-04"),
      isoToDayNumber("2026-03-09"),
      RULER_TIER.Weeks,
    );
    expect(range.startDay).toBe(isoToDayNumber("2026-03-02"));
    expect(range.endDay).toBe(isoToDayNumber("2026-03-15"));
  });

  it("по місяцях дає цілі місяці", () => {
    const range = snappedCreationRange(
      isoToDayNumber("2026-03-04"),
      isoToDayNumber("2026-04-20"),
      RULER_TIER.Months,
    );
    expect(range.startDay).toBe(isoToDayNumber("2026-03-01"));
    expect(range.endDay).toBe(isoToDayNumber("2026-04-30"));
  });

  it("не залежить від того, в який бік тягнули", () => {
    const forward = snappedCreationRange(100, 130, RULER_TIER.Days);
    expect(snappedCreationRange(130, 100, RULER_TIER.Days)).toEqual(forward);
  });
});

describe("подія від подвійного кліку", () => {
  it("тримає сталу ширину в пікселях, а не в днях", () => {
    const day = isoToDayNumber("2026-03-04");
    const wide = quickEventRange(day, 9, RULER_TIER.Days);
    const narrow = quickEventRange(day, 0.5, RULER_TIER.Days);
    expect(wide.endDay - wide.startDay + 1).toBe(10);
    expect(narrow.endDay - narrow.startDay + 1).toBe(180);
  });

  it("прилипає так само, як протяжка", () => {
    const day = isoToDayNumber("2026-03-04");
    const quick = quickEventRange(day, 3, RULER_TIER.Months);
    expect(quick.startDay).toBe(isoToDayNumber("2026-03-01"));
    expect(quick.endDay).toBe(isoToDayNumber("2026-03-31"));
  });

  it("не сходить нанівець на найдрібнішому масштабі", () => {
    const day = isoToDayNumber("2026-03-04");
    expect(quickEventRange(day, 1000, RULER_TIER.Days)).toEqual({ startDay: day, endDay: day });
  });
});
