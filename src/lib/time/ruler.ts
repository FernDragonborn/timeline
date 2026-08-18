import {
  dateToDayNumber,
  dayNumberToDate,
  formatDayShort,
  isWeekend,
  MONTH_NAMES_FULL,
  MONTH_NAMES_SHORT,
  type DayNumber,
} from "./day-number";

/**
 * Лінійка має два яруси: великий (роки/місяці) і малий (місяці/тижні/дні).
 * Який саме — виводиться з масштабу, а не обирається користувачем: окремий
 * перемикач «показати дні» був би другим джерелом правди про те, наскільки
 * дрібно ми зараз дивимось.
 */

export const PERIOD_KIND = {
  Day: "day",
  Week: "week",
  Month: "month",
  Quarter: "quarter",
  Year: "year",
  Decade: "decade",
} as const;
export type PeriodKind = (typeof PERIOD_KIND)[keyof typeof PERIOD_KIND];

export const RULER_TIER = {
  Days: "days",
  Weeks: "weeks",
  Months: "months",
  Quarters: "quarters",
  Years: "years",
} as const;
export type RulerTier = (typeof RULER_TIER)[keyof typeof RULER_TIER];

export const RULER_TIER_LABEL: Record<RulerTier, string> = {
  [RULER_TIER.Days]: "дні",
  [RULER_TIER.Weeks]: "тижні",
  [RULER_TIER.Months]: "місяці",
  [RULER_TIER.Quarters]: "квартали",
  [RULER_TIER.Years]: "роки",
};

/** Пікселів на день, за яких ярус ще має сенс. Перевіряються згори вниз. */
const TIER_THRESHOLDS: ReadonlyArray<{ tier: RulerTier; minPixelsPerDay: number }> = [
  { tier: RULER_TIER.Days, minPixelsPerDay: 14 },
  { tier: RULER_TIER.Weeks, minPixelsPerDay: 3.2 },
  { tier: RULER_TIER.Months, minPixelsPerDay: 0.7 },
  { tier: RULER_TIER.Quarters, minPixelsPerDay: 0.2 },
];

export function tierForScale(pixelsPerDay: number): RulerTier {
  const match = TIER_THRESHOLDS.find((entry) => pixelsPerDay >= entry.minPixelsPerDay);
  return match ? match.tier : RULER_TIER.Years;
}

export interface Period {
  /** Перший день періоду, включно. */
  startDay: DayNumber;
  /** Перший день НАСТУПНОГО періоду — тобто межа, не останній день. */
  endDay: DayNumber;
  label: string;
  isWeekend: boolean;
}

interface TierLayout {
  major: PeriodKind;
  minor: PeriodKind;
}

const TIER_LAYOUT: Record<RulerTier, TierLayout> = {
  [RULER_TIER.Days]: { major: PERIOD_KIND.Month, minor: PERIOD_KIND.Day },
  [RULER_TIER.Weeks]: { major: PERIOD_KIND.Month, minor: PERIOD_KIND.Week },
  [RULER_TIER.Months]: { major: PERIOD_KIND.Year, minor: PERIOD_KIND.Month },
  [RULER_TIER.Quarters]: { major: PERIOD_KIND.Year, minor: PERIOD_KIND.Quarter },
  [RULER_TIER.Years]: { major: PERIOD_KIND.Decade, minor: PERIOD_KIND.Year },
};

export function tierLayout(tier: RulerTier): TierLayout {
  return TIER_LAYOUT[tier];
}

function alignToPeriodStart(date: Date, kind: PeriodKind): void {
  switch (kind) {
    case PERIOD_KIND.Day:
      break;
    case PERIOD_KIND.Week:
      /* Тиждень починається з понеділка: getUTCDay() дає 0 для неділі. */
      date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
      break;
    case PERIOD_KIND.Month:
      date.setUTCDate(1);
      break;
    case PERIOD_KIND.Quarter:
      date.setUTCDate(1);
      date.setUTCMonth(Math.floor(date.getUTCMonth() / 3) * 3);
      break;
    case PERIOD_KIND.Year:
      date.setUTCDate(1);
      date.setUTCMonth(0);
      break;
    case PERIOD_KIND.Decade:
      date.setUTCDate(1);
      date.setUTCMonth(0);
      date.setUTCFullYear(Math.floor(date.getUTCFullYear() / 10) * 10);
      break;
  }
}

function advanceOnePeriod(date: Date, kind: PeriodKind): void {
  switch (kind) {
    case PERIOD_KIND.Day:
      date.setUTCDate(date.getUTCDate() + 1);
      break;
    case PERIOD_KIND.Week:
      date.setUTCDate(date.getUTCDate() + 7);
      break;
    case PERIOD_KIND.Month:
      date.setUTCMonth(date.getUTCMonth() + 1);
      break;
    case PERIOD_KIND.Quarter:
      date.setUTCMonth(date.getUTCMonth() + 3);
      break;
    case PERIOD_KIND.Year:
      date.setUTCFullYear(date.getUTCFullYear() + 1);
      break;
    case PERIOD_KIND.Decade:
      date.setUTCFullYear(date.getUTCFullYear() + 10);
      break;
  }
}

function labelForPeriod(date: Date, kind: PeriodKind): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  switch (kind) {
    case PERIOD_KIND.Day:
      return String(date.getUTCDate());
    case PERIOD_KIND.Week:
      return formatDayShort(dateToDayNumber(date));
    case PERIOD_KIND.Month:
      return MONTH_NAMES_SHORT[month] ?? "";
    case PERIOD_KIND.Quarter:
      return `Q${Math.floor(month / 3) + 1}`;
    case PERIOD_KIND.Year:
      return String(year);
    case PERIOD_KIND.Decade:
      return `${year}-ті`;
  }
}

/** Великий ярус підписується повніше: «березень 2026», а не «бер». */
function labelForMajorPeriod(date: Date, kind: PeriodKind): string {
  if (kind === PERIOD_KIND.Month) {
    return `${MONTH_NAMES_FULL[date.getUTCMonth()] ?? ""} ${date.getUTCFullYear()}`;
  }
  return labelForPeriod(date, kind);
}

/**
 * Періоди будуються ТІЛЬКИ для заданого вікна, і це не оптимізація «на потім».
 * Прокручувана шкала не має меж — доїхавши до краю, користувач її розсовує, —
 * тож домен спокійно розтягується на століття. День за днем це десятки тисяч
 * вузлів; порахувати їх усі заради одного екрана і є та причина, через яку
 * такі шкали зазвичай мовчки прибиті до поточного року.
 */
/** Початок періоду, у який потрапляє день. */
export function snapToPeriodStart(day: DayNumber, kind: PeriodKind): DayNumber {
  const date = dayNumberToDate(day);
  alignToPeriodStart(date, kind);
  return dateToDayNumber(date);
}

/** Останній день періоду, у який потрапляє день — включно. */
export function snapToPeriodEnd(day: DayNumber, kind: PeriodKind): DayNumber {
  const date = dayNumberToDate(day);
  alignToPeriodStart(date, kind);
  advanceOnePeriod(date, kind);
  return dateToDayNumber(date) - 1;
}

/**
 * До чого притягувати межі під час малювання. Це саме дрібний ярус лінійки:
 * прилипати треба до того, що людина бачить на шкалі, — інакше «до кінця
 * березня» доводиться ловити піксель.
 */
export function snapKindForTier(tier: RulerTier): PeriodKind {
  return TIER_LAYOUT[tier].minor;
}

export function periodsInRange(
  kind: PeriodKind,
  fromDay: DayNumber,
  toDay: DayNumber,
  options: { major?: boolean } = {},
): Period[] {
  const periods: Period[] = [];
  if (toDay < fromDay) return periods;

  const cursor = dayNumberToDate(fromDay);
  alignToPeriodStart(cursor, kind);

  /* Запобіжник від нескінченного циклу, якщо межі раптом абсурдні. */
  const maxPeriods = 10_000;
  while (periods.length < maxPeriods) {
    const startDay = dateToDayNumber(cursor);
    const label = options.major
      ? labelForMajorPeriod(cursor, kind)
      : labelForPeriod(cursor, kind);
    advanceOnePeriod(cursor, kind);
    periods.push({
      startDay,
      endDay: dateToDayNumber(cursor),
      label,
      isWeekend: kind === PERIOD_KIND.Day && isWeekend(startDay),
    });
    if (startDay > toDay) break;
  }
  return periods;
}
