/**
 * Час у застосунку — це ЦІЛЕ число днів від епохи Unix, у UTC.
 *
 * Нащо не `Date`: подія має цілоденні межі, а `Date` тягне години, хвилини й
 * локальний часовий пояс. Щойно в обчислення потрапляє пояс, подія на межі
 * місяця починає стрибати на добу залежно від того, де сидить користувач, а
 * різниця двох дат перестає бути цілим числом. Ціле число днів робить
 * арифметику точною, а порівняння — тривіальним.
 *
 * ISO-рядок `YYYY-MM-DD` — форма для файлу й для полів вводу, і більше ніде.
 */

const MILLISECONDS_PER_DAY = 86_400_000;

/** Номер дня — цілі доби від 1970-01-01 UTC. Від'ємні значення — до епохи. */
export type DayNumber = number;

export function isoToDayNumber(iso: string): DayNumber {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / MILLISECONDS_PER_DAY);
}

export function dayNumberToIso(day: DayNumber): string {
  return dayNumberToDate(day).toISOString().slice(0, 10);
}

export function dayNumberToDate(day: DayNumber): Date {
  return new Date(day * MILLISECONDS_PER_DAY);
}

export function dateToDayNumber(date: Date): DayNumber {
  return Math.floor(date.getTime() / MILLISECONDS_PER_DAY);
}

export function today(): DayNumber {
  return dateToDayNumber(new Date());
}

export function isWeekend(day: DayNumber): boolean {
  const weekday = dayNumberToDate(day).getUTCDay();
  return weekday === 0 || weekday === 6;
}

export const MONTH_NAMES_FULL = [
  "січень", "лютий", "березень", "квітень", "травень", "червень",
  "липень", "серпень", "вересень", "жовтень", "листопад", "грудень",
] as const;

export const MONTH_NAMES_SHORT = [
  "січ", "лют", "бер", "кві", "тра", "чер",
  "лип", "сер", "вер", "жов", "лис", "гру",
] as const;

/** «У родовому відмінку» — для дати з числом: 15 березня. */
export const MONTH_NAMES_GENITIVE = [
  "січня", "лютого", "березня", "квітня", "травня", "червня",
  "липня", "серпня", "вересня", "жовтня", "листопада", "грудня",
] as const;

function monthName(names: readonly string[], monthIndex: number): string {
  return names[monthIndex] ?? "";
}

export function formatDayHuman(day: DayNumber): string {
  const date = dayNumberToDate(day);
  return `${date.getUTCDate()} ${monthName(MONTH_NAMES_GENITIVE, date.getUTCMonth())} ${date.getUTCFullYear()}`;
}

export function formatDayShort(day: DayNumber): string {
  const date = dayNumberToDate(day);
  return `${date.getUTCDate()} ${monthName(MONTH_NAMES_SHORT, date.getUTCMonth())}`;
}

/**
 * Межі подій ВКЛЮЧНІ з обох боків, тож подія з однаковими start і end триває
 * один день, а не нуль. Це єдине місце, де це знання закодоване.
 */
export function inclusiveDayCount(startDay: DayNumber, endDay: DayNumber): number {
  return endDay - startDay + 1;
}

export function formatDayCount(count: number): string {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  if (lastDigit === 1 && lastTwoDigits !== 11) return `${count} день`;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) return `${count} дні`;
  return `${count} днів`;
}

export function formatDaySpan(startDay: DayNumber, endDay: DayNumber): string {
  const days = formatDayCount(inclusiveDayCount(startDay, endDay));
  return `${formatDayHuman(startDay)} → ${formatDayHuman(endDay)} · ${days}`;
}
