import { today, type DayNumber } from "../time/day-number";

/**
 * Видима ділянка часу та перетворення день ↔ піксель.
 *
 * Домен одразу широкий — сто років у кожен бік від сьогодні, — і НЕ росте від
 * прокрутки. Спершу він розсовувався на краю з компенсацією прокрутки, і це
 * була помилка: щоб компенсація зберегла картинку, вона повертає користувача
 * рівно туди, звідки він щойно поїхав, тобто прокрутка вліво відкидала вперед.
 * Широкий домен прибирає і цю арифметику, і цілий клас стрибків разом з нею.
 *
 * Дати поза цими двома століттями досяжні через «Перейти до»: там домен
 * розсовується один раз, а стрибок у часі — саме те, що користувач і просив.
 */

export interface TimeDomain {
  fromDay: DayNumber;
  toDay: DayNumber;
}

export const MIN_PIXELS_PER_DAY = 0.05;
export const MAX_PIXELS_PER_DAY = 42;

/**
 * Один «клац» колеса (deltaY ≈ 100) множить масштаб приблизно на 1.5. Крок
 * навмисно грубий: весь діапазон має проходитись за кілька рухів, а не за
 * довге накручування.
 */
export const ZOOM_WHEEL_BASE = 1.004;
export const ZOOM_KEY_STEP = 1.6;

const SLIDER_STEPS = 1000;
const ZOOM_RANGE = MAX_PIXELS_PER_DAY / MIN_PIXELS_PER_DAY;

export function clampScale(pixelsPerDay: number): number {
  return Math.min(MAX_PIXELS_PER_DAY, Math.max(MIN_PIXELS_PER_DAY, pixelsPerDay));
}

/* Слайдер логарифмічний: інакше половина його ходу припадала б на масштаби,
   де все одно нічого не видно. */
export function sliderToScale(sliderValue: number): number {
  return MIN_PIXELS_PER_DAY * Math.pow(ZOOM_RANGE, sliderValue / SLIDER_STEPS);
}

export function scaleToSlider(pixelsPerDay: number): number {
  return Math.round((SLIDER_STEPS * Math.log(pixelsPerDay / MIN_PIXELS_PER_DAY)) / Math.log(ZOOM_RANGE));
}

export const SLIDER_MAX = SLIDER_STEPS;

const DAYS_PER_YEAR = 365.2425;
const DEFAULT_DOMAIN_HALF_DAYS = Math.round(100 * DAYS_PER_YEAR);
/** Запас навколо даних, коли вони виходять за типовий домен. */
const DATA_PADDING_DAYS = Math.round(5 * DAYS_PER_YEAR);

export function defaultDomain(): TimeDomain {
  const centre = today();
  return { fromDay: centre - DEFAULT_DOMAIN_HALF_DAYS, toDay: centre + DEFAULT_DOMAIN_HALF_DAYS };
}

/** Типовий домен, розсунутий так, щоб дані гарантовано в нього влізли. */
export function domainAroundDays(days: readonly DayNumber[]): TimeDomain {
  const domain = defaultDomain();
  if (days.length === 0) return domain;
  return domainCovering(
    domain,
    Math.min(...days) - DATA_PADDING_DAYS,
    Math.max(...days) + DATA_PADDING_DAYS,
  );
}

export function domainCovering(domain: TimeDomain, fromDay: DayNumber, toDay: DayNumber): TimeDomain {
  return {
    fromDay: Math.min(domain.fromDay, fromDay),
    toDay: Math.max(domain.toDay, toDay),
  };
}

export function domainWidthPixels(domain: TimeDomain, pixelsPerDay: number): number {
  return Math.max(600, (domain.toDay - domain.fromDay) * pixelsPerDay);
}

export function dayToPixel(domain: TimeDomain, pixelsPerDay: number, day: DayNumber): number {
  return (day - domain.fromDay) * pixelsPerDay;
}

export function pixelToDay(domain: TimeDomain, pixelsPerDay: number, pixel: number): DayNumber {
  return domain.fromDay + pixel / pixelsPerDay;
}

export interface VisibleRange {
  fromDay: DayNumber;
  toDay: DayNumber;
}

/**
 * Вікно, для якого варто будувати поділки: видима частина плюс екран запасу з
 * кожного боку, щоб під час прокрутки не з'являлася порожня смуга.
 */
export function visibleRange(
  domain: TimeDomain,
  pixelsPerDay: number,
  scrollLeftPixels: number,
  viewportWidthPixels: number,
): VisibleRange {
  const margin = viewportWidthPixels;
  return {
    fromDay: Math.max(
      domain.fromDay,
      Math.floor(pixelToDay(domain, pixelsPerDay, scrollLeftPixels - margin)),
    ),
    toDay: Math.min(
      domain.toDay,
      Math.ceil(pixelToDay(domain, pixelsPerDay, scrollLeftPixels + viewportWidthPixels + margin)),
    ),
  };
}
