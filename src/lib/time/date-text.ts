import { dayNumberOfParts, dayNumberToDate, type DayNumber } from "./day-number";

/**
 * Текстова форма дати для полів вводу: «20.03.2026».
 *
 * Нащо своя, коли є `<input type="date">`: той елемент — не текстове поле, а
 * три секції з лічильниками. Курсора в ньому немає, Backspace очищає цілу
 * секцію, вставка не працює, і щоб виправити рік, доводиться вводити всі
 * чотири цифри. Формат він до того ж бере з мови інтерфейсу браузера, а не з
 * мови застосунку.
 */

const SEPARATOR = "[.,/\\s-]";
const DAY_FIRST = new RegExp(`^(\\d{1,2})${SEPARATOR}(\\d{1,2})${SEPARATOR}(\\d{4})$`);
const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

export type DateTextParse = { ok: true; day: DayNumber } | { ok: false };

export function formatDateText(day: DayNumber): string {
  const date = dayNumberToDate(day);
  const dayOfMonth = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dayOfMonth}.${month}.${date.getUTCFullYear()}`;
}

/**
 * Приймає і «20.03.2026», і «2026-03-20»: другий формат лежить у файлі, тож
 * вставка звідти має просто працювати. Роздільник вільний — крапка, кома,
 * скісна риска, пробіл, — бо на цифровій клавіатурі зручна саме крапка, а з
 * файлу прилітає дефіс.
 */
export function parseDateText(text: string): DateTextParse {
  const trimmed = text.trim();

  const iso = matchThreeNumbers(ISO, trimmed);
  if (iso !== null) return fromParts(iso[2], iso[1], iso[0]);

  const dayFirst = matchThreeNumbers(DAY_FIRST, trimmed);
  if (dayFirst !== null) return fromParts(dayFirst[0], dayFirst[1], dayFirst[2]);

  return { ok: false };
}

function matchThreeNumbers(pattern: RegExp, text: string): [number, number, number] | null {
  const match = pattern.exec(text);
  if (match === null) return null;
  const [, first, second, third] = match;
  if (first === undefined || second === undefined || third === undefined) return null;
  return [Number(first), Number(second), Number(third)];
}

function fromParts(dayOfMonth: number, month: number, year: number): DateTextParse {
  const day = dayNumberOfParts(year, month, dayOfMonth);
  return day === null ? { ok: false } : { ok: true, day };
}
