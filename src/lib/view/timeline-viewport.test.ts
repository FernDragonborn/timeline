import { describe, expect, it } from "vitest";
import {
  clampScale,
  dayToPixel,
  defaultDomain,
  domainAroundDays,
  domainCovering,
  domainWidthPixels,
  pixelToDay,
  scaleToSlider,
  sliderToScale,
  visibleRange,
  MAX_PIXELS_PER_DAY,
  MIN_PIXELS_PER_DAY,
  SLIDER_MAX,
} from "./timeline-viewport";
import { isoToDayNumber } from "../time/day-number";

const domain = { fromDay: isoToDayNumber("2020-01-01"), toDay: isoToDayNumber("2030-01-01") };

describe("день ↔ піксель", () => {
  it("починає відлік від лівого краю домену", () => {
    expect(dayToPixel(domain, 3, domain.fromDay)).toBe(0);
    expect(dayToPixel(domain, 3, domain.fromDay + 10)).toBe(30);
  });

  it("робить обіг день → піксель → день без втрат", () => {
    for (const pixelsPerDay of [0.05, 1.4, 42]) {
      const day = isoToDayNumber("2026-08-22");
      expect(pixelToDay(domain, pixelsPerDay, dayToPixel(domain, pixelsPerDay, day))).toBeCloseTo(
        day,
        6,
      );
    }
  });

  it("тримає мінімальну ширину полотна на дрібному масштабі", () => {
    const narrow = { fromDay: 0, toDay: 10 };
    expect(domainWidthPixels(narrow, 0.05)).toBe(600);
    expect(domainWidthPixels(domain, 1)).toBe(domain.toDay - domain.fromDay);
  });
});

describe("домен", () => {
  it("розсовується лише в той бік, де не вистачає", () => {
    const widened = domainCovering(domain, domain.fromDay - 5, domain.toDay - 100);
    expect(widened.fromDay).toBe(domain.fromDay - 5);
    expect(widened.toDay).toBe(domain.toDay);
  });

  it("не звужується, коли діапазон уже всередині", () => {
    expect(domainCovering(domain, domain.fromDay + 10, domain.toDay - 10)).toEqual(domain);
  });

  it("охоплює сторіччя в кожен бік від сьогодні", () => {
    const free = defaultDomain();
    const years = (free.toDay - free.fromDay) / 365.2425;
    expect(years).toBeCloseTo(200, 0);
  });

  it("розсовується під дані, що виходять за типовий домен", () => {
    const ancient = isoToDayNumber("1500-01-01");
    const around = domainAroundDays([ancient, isoToDayNumber("1510-01-01")]);
    expect(around.fromDay).toBeLessThan(ancient);
    expect(around.toDay).toBe(defaultDomain().toDay);
  });

  it("без даних лишається типовим", () => {
    expect(domainAroundDays([])).toEqual(defaultDomain());
  });
});

describe("видиме вікно", () => {
  it("додає екран запасу з кожного боку", () => {
    const range = visibleRange(domain, 2, 1000, 800);
    expect(range.fromDay).toBe(Math.floor(pixelToDay(domain, 2, 200)));
    expect(range.toDay).toBe(Math.ceil(pixelToDay(domain, 2, 2600)));
  });

  it("не виходить за домен на його краях", () => {
    const range = visibleRange(domain, 2, 0, 800);
    expect(range.fromDay).toBe(domain.fromDay);

    const end = domainWidthPixels(domain, 2);
    expect(visibleRange(domain, 2, end - 800, 800).toDay).toBe(domain.toDay);
  });
});

describe("масштаб", () => {
  it("тримається в межах", () => {
    expect(clampScale(1000)).toBe(MAX_PIXELS_PER_DAY);
    expect(clampScale(0)).toBe(MIN_PIXELS_PER_DAY);
    expect(clampScale(1.4)).toBe(1.4);
  });

  it("кладе краї слайдера рівно на краї масштабу", () => {
    expect(sliderToScale(0)).toBeCloseTo(MIN_PIXELS_PER_DAY, 10);
    expect(sliderToScale(SLIDER_MAX)).toBeCloseTo(MAX_PIXELS_PER_DAY, 10);
  });

  it("робить обіг слайдер → масштаб → слайдер без зсуву", () => {
    for (const slider of [0, 1, 250, 500, 999, SLIDER_MAX]) {
      expect(scaleToSlider(sliderToScale(slider))).toBe(slider);
    }
  });

  it("логарифмічний: рівні кроки слайдера множать масштаб на однакове число", () => {
    const first = sliderToScale(200) / sliderToScale(100);
    const second = sliderToScale(700) / sliderToScale(600);
    expect(first).toBeCloseTo(second, 10);
  });
});
