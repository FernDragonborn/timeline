import { pixelToDay, type TimeDomain } from "./timeline-viewport";
import type { DayNumber } from "../time/day-number";
import { snapKindForTier, snapToPeriodEnd, snapToPeriodStart, type RulerTier } from "../time/ruler";

/**
 * Арифметика жестів на полотні: колесо, рамка виділення, прилипання нової
 * події. Без DOM — координати й розміри приходять аргументами, тож усе це
 * перевіряється тестом, а компонент лишається тонкою оболонкою.
 */

/** Далі якого зсуву натискання вважається перетягуванням, а не кліком. */
export const DRAG_THRESHOLD_PIXELS = 4;

/** Ширина блока, який дає подвійний клік, — стала в пікселях, не в днях. */
const QUICK_EVENT_PIXELS = 90;

/** `WheelEvent.deltaMode`, коли крок міряється рядками, а не пікселями. */
const WHEEL_DELTA_LINE = 1;
/** У скільки пікселів рахувати такий рядок. */
const WHEEL_LINE_PIXELS = 33;

/** Те, що з `WheelEvent` потрібно для кроку — і що легко скласти в тесті. */
export interface WheelStep {
  deltaMode: number;
  deltaX: number;
  deltaY: number;
}

/**
 * Крок колеса в пікселях, незалежно від того, на яку вісь браузер його поклав.
 *
 * Осі тут не фіксовані: із затиснутим Shift Chromium сам переносить крок з
 * `deltaY` у `deltaX`, тож читати лише одну вісь — значить не побачити
 * половини випадків. `deltaMode` «рядки» без множника дає крок у кілька
 * пікселів, тобто рух ледь помітний.
 */
export function wheelStepPixels(wheel: WheelStep): number {
  const scale = wheel.deltaMode === WHEEL_DELTA_LINE ? WHEEL_LINE_PIXELS : 1;
  const dominant = Math.abs(wheel.deltaY) >= Math.abs(wheel.deltaX) ? wheel.deltaY : wheel.deltaX;
  return dominant * scale;
}

/**
 * День під пікселем полотна, обрізаний доменом: полотно ширше за домен, коли
 * вікно більше за шкалу, і без обмеження клік по порожньому місцю праворуч
 * створював би подію за межами документа.
 */
export function dayAtBodyPixel(
  domain: TimeDomain,
  pixelsPerDay: number,
  bodyPixel: number,
): DayNumber {
  const day = Math.round(pixelToDay(domain, pixelsPerDay, bodyPixel));
  return Math.min(domain.toDay, Math.max(domain.fromDay, day));
}

/** Рамка виділення, у координатах вікна — саме в них лежать прямокутники подій. */
export interface MarqueeBox {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

/** Сторони прямокутника у координатах вікна — форма `DOMRect`, але без DOM. */
export interface ScreenRectangle {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Рамку тягнуть у будь-який бік, тож перед порівнянням сторони впорядковуємо. */
export function marqueeSides(box: MarqueeBox): ScreenRectangle {
  return {
    left: Math.min(box.fromX, box.toX),
    right: Math.max(box.fromX, box.toX),
    top: Math.min(box.fromY, box.toY),
    bottom: Math.max(box.fromY, box.toY),
  };
}

/** Дотик рахується влученням: подія шириною в піксель має ловитися рамкою. */
export function rectanglesOverlap(first: ScreenRectangle, second: ScreenRectangle): boolean {
  return (
    first.right >= second.left &&
    first.left <= second.right &&
    first.bottom >= second.top &&
    first.top <= second.bottom
  );
}

export interface DayRange {
  startDay: DayNumber;
  endDay: DayNumber;
}

/**
 * Межі майбутньої події, притягнуті до поділок поточного масштабу. Малюючи по
 * місяцях, людина й хоче «весь березень», а не «з 3 по 29» — ловити піксель
 * заради рівної дати нікому не треба.
 */
export function snappedCreationRange(
  anchorDay: DayNumber,
  currentDay: DayNumber,
  tier: RulerTier,
): DayRange {
  const kind = snapKindForTier(tier);
  return {
    startDay: snapToPeriodStart(Math.min(anchorDay, currentDay), kind),
    endDay: snapToPeriodEnd(Math.max(anchorDay, currentDay), kind),
  };
}

/**
 * Межі події від подвійного кліку. Прилипання те саме, що й у перетягуванні:
 * спосіб створення не має міняти те, на які дати подія сяде.
 */
export function quickEventRange(day: DayNumber, pixelsPerDay: number, tier: RulerTier): DayRange {
  const kind = snapKindForTier(tier);
  const startDay = snapToPeriodStart(day, kind);
  const spanDays = Math.max(1, Math.round(QUICK_EVENT_PIXELS / pixelsPerDay));
  return { startDay, endDay: snapToPeriodEnd(startDay + spanDays - 1, kind) };
}
